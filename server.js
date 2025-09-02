import express from "express";
import axios from "axios";

const app = express();

// Конфигурация
const CONFIG = {
    models: ["Model 3", "Model Y", "Model X"], // модели
    maxPrice: 31000,                            // цена до $31,000
    region: "US",                               // регион
    checkIntervalSec: 120,                      // базовый интервал проверки
    jitterSec: 20                               // джиттер ±20 секунд
};

// Telegram
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let cachedVINs = new Set();
let hasNewCars = false;

// контроль ошибок
let lastErrorTime = 0;
let wasError = false;
let consecutiveErrors = 0; // подряд идущие ошибки

// Отправка сообщений через Telegram
async function sendToTelegram(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text
        });
        console.log("📩 Отправлено в Telegram");
    } catch (error) {
        console.error("❌ Ошибка Telegram:", error.message);
    }
}

// Получение машин с фильтром
async function fetchCars() {
    try {
        const query = encodeURIComponent(JSON.stringify({
            query: {
                model: CONFIG.models,
                condition: "used",
                arrangeby: "Relevance",
                order: "desc",
                market: CONFIG.region
            },
            offset: 0,
            count: 50,
            outsideOffset: 0,
            outsideSearch: false
        }));

        const url = `https://www.tesla.com/inventory/api/v4/inventory-results?query=${query}`;

        const { data, status } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json, text/plain, */*",
                "Referer": `https://www.tesla.com/inventory/used/${CONFIG.models[0].toLowerCase().replace(" ", "")}`
            },
            validateStatus: () => true
        });

        if (status !== 200) {
            throw new Error(`Tesla вернула статус ${status}`);
        }

        const cars = (data.results || []).map(car => ({
            vin: car.VIN,
            model: car.Model,
            year: car.Year,
            price: car.PurchasePrice,
            odometer: car.Odometer,
            city: car.City,
            state: car.StateProvince,
            addedDate: car.AddedDate
        }));

        // фильтр по цене (разрешаем без цены)
        const filtered = cars.filter(car =>
            CONFIG.models.includes(car.model) && (car.price === null || car.price <= CONFIG.maxPrice)
        );

        const fresh = filtered.filter(car => !cachedVINs.has(car.vin));

        if (fresh.length > 0) hasNewCars = true;

        // если есть новые машины — шлём списком
        if (fresh.length > 0) {
            const text = fresh.map(car => {
                cachedVINs.add(car.vin);
                return `🚗 ${car.year} ${car.model}
Цена: ${car.price ? "$" + car.price : "❓ Не указана"}
Пробег: ${car.odometer} миль
Место: ${car.city}, ${car.state}
VIN: ${car.vin}
Дата добавления: ${car.addedDate}
🔗 https://www.tesla.com/m3/order/${car.vin}`;
            }).join("\n\n");

            await sendToTelegram(`🔥 Найдены новые машины:\n\n${text}`);
        } else {
            console.log("❌ Новых машин нет:", new Date().toLocaleTimeString());
        }

        // успешный запрос → сбрасываем ошибки
        if (wasError || consecutiveErrors > 0) {
            await sendToTelegram(`✅ Запросы снова успешны (${new Date().toLocaleTimeString()})`);
            wasError = false;
            consecutiveErrors = 0;
        }

    } catch (error) {
        console.error("❌ Ошибка запроса:", error.message);
        const now = Date.now();

        consecutiveErrors++;
        if (now - lastErrorTime > 60 * 60 * 1000) {
            await sendToTelegram(`⚠️ Ошибка запроса к Tesla: ${error.message}
Подряд ошибок: ${consecutiveErrors}`);
            lastErrorTime = now;
        }
        wasError = true;
    }
}

// Мониторинг с setInterval и джиттером
function scheduleFetch() {
    const jitter = Math.floor(Math.random() * (CONFIG.jitterSec * 2 + 1)) - CONFIG.jitterSec;
    const interval = (CONFIG.checkIntervalSec + jitter) * 1000;

    setTimeout(async () => {
        await fetchCars();
        scheduleFetch(); // рекурсивное перепланирование
    }, interval);
}

// Первый запуск мониторинга
scheduleFetch();

// Ежечасовое уведомление о статусе
setInterval(async () => {
    if (!hasNewCars) {
        await sendToTelegram(`ℹ️ Брат, Проверка успешна, но новых машин нет: ${new Date().toLocaleTimeString()}`);
    }
    hasNewCars = false;
}, 60 * 60 * 1000);

// Каждые 3 часа — отчёт по настройкам
setInterval(async () => {
    const configText = `🛠 Текущие настройки бота:
Частота запросов: каждые ${CONFIG.checkIntervalSec} сек ±${CONFIG.jitterSec} сек
Регион: ${CONFIG.region}
Модели: ${CONFIG.models.join(", ")}
Цена до: $${CONFIG.maxPrice}
Отчёты: статус раз в час, полный конфиг раз в 3 часа`;

    await sendToTelegram(configText);
},  1000);

// Запуск сервера
app.listen(3000, () => console.log("🚀 Сервер запущен на порту 3000"));

import express from "express";
import axios from "axios";

const app = express();

// Конфигурация
const CONFIG = {
    models: ["Model 3", "Model Y", "Model X"], // модели для Telegram
    maxPrice: 25000,                            // фильтр цены для Telegram
    region: "US",                               // регион
    checkIntervalSec: 120,                      // базовый интервал проверки
    jitterSec: 20                               // джиттер ±20 секунд
};

// Telegram
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let cachedVINs = new Set();
let hasNewCars = false;
let isFirstRun = true; // флаг первого запуска

let lastResponses = [];

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

// Получение всех машин с price <= 27,000
async function fetchCars() {
    try {
        const query = encodeURIComponent(JSON.stringify({
            query: {
                condition: "used",
                arrangeby: "Relevance",
                order: "desc",
                market: CONFIG.region,
                price: { max: 27000 } // единственный фильтр на запрос
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
                "Accept": "application/json, text/plain, */*"
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

        // Фильтруем по CONFIG перед отправкой в Telegram
        const filtered = cars.filter(car =>
            CONFIG.models.includes(car.model) && (car.price === null || car.price <= CONFIG.maxPrice)
        );

        const fresh = isFirstRun
            ? filtered
            : filtered.filter(car => !cachedVINs.has(car.vin));

        // Обновляем кэш
        fresh.forEach(car => cachedVINs.add(car.vin));

        // Формируем отчёт для Telegram
        const now = new Date();
        lastResponses.push({ time: now.toLocaleTimeString(), total: cars.length, newCars: fresh.length });
        if (lastResponses.length > 10) lastResponses.shift();

        let reportText = `📊 Всего машин с ценой <= 27,000: ${cars.length}\n`;
        reportText += `🚘 Соответствуют конфигу (модели + maxPrice ${CONFIG.maxPrice}): ${filtered.length}\n`;

        if (fresh.length > 0) {
            const carsText = fresh.map(car =>
                `🚗 ${car.year} ${car.model}
Цена: ${car.price ? "$" + car.price : "❓ Не указана"}
Пробег: ${car.odometer} миль
Место: ${car.city}, ${car.state}
VIN: ${car.vin}
Дата добавления: ${car.addedDate}
🔗 https://www.tesla.com/m3/order/${car.vin}`
            ).join("\n\n");
            reportText += `\n\n🔥 Новые машины:\n\n${carsText}`;
            hasNewCars = true;
        }

        if (reportText) await sendToTelegram(reportText);

        isFirstRun = false;

    } catch (error) {
        console.error("❌ Ошибка запроса:", error.message);
    }
}

// Мониторинг с setInterval и джиттером
function scheduleFetch() {
    const jitter = Math.floor(Math.random() * (CONFIG.jitterSec * 2 + 1)) - CONFIG.jitterSec;
    const interval = (CONFIG.checkIntervalSec + jitter) * 1000;

    setTimeout(async () => {
        await fetchCars();
        scheduleFetch();
    }, interval);
}

// Первый запуск мониторинга
scheduleFetch();

// Ежечасовое уведомление о статусе
setInterval(async () => {
    if (!hasNewCars) {
        await sendToTelegram(`ℹ️ Проверка успешна, но новых машин нет: ${new Date().toLocaleTimeString()}`);
    }
    hasNewCars = false;
}, 60 * 60 * 1000);

// Каждые 3 часа — отчёт по настройкам и последние 3 ответа
setInterval(async () => {
    const configText = `🛠 Настройки бота:
Частота запросов: каждые ${CONFIG.checkIntervalSec} сек ±${CONFIG.jitterSec} сек
Регион: ${CONFIG.region}
Модели: ${CONFIG.models.join(", ")}
Фильтр цены для Telegram: $${CONFIG.maxPrice}
Отчёты: статус раз в час, полный конфиг раз в 3 часа

📊 Последние 3 ответа:`;

    const last3 = lastResponses.slice(-3).map(r => `${r.time} — всего: ${r.total}, новых: ${r.newCars}`).join("\n");

    await sendToTelegram(configText + "\n\n" + last3);
}, 3 * 60 * 60 * 1000);

// Запуск сервера
app.listen(3000, () => console.log("🚀 Сервер запущен на порту 3000"));

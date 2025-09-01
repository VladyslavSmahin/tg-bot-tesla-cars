import express from "express";
import axios from "axios";

const app = express();

// Конфигурация
const CONFIG = {
    models: ["Model 3", "Model Y", "Model X"], // модели
    maxPrice: 31000,                            // цена до $31,000
    region: "US",                               // регион
    checkIntervalSec: 120,                       // базовый интервал проверки
    jitterSec: 20                               // джиттер ±10 секунд
};

// Telegram
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let cachedVINs = new Set();
let hasNewCars = false;

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

        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json, text/plain, */*",
                "Referer": `https://www.tesla.com/inventory/used/${CONFIG.models[0].toLowerCase().replace(" ", "")}`
            }
        });

        const cars = data.results.map(car => ({
            vin: car.VIN,
            model: car.Model,
            year: car.Year,
            price: car.PurchasePrice,
            odometer: car.Odometer,
            city: car.City,
            state: car.StateProvince,
            addedDate: car.AddedDate
        }));

        const filtered = cars.filter(car =>
            CONFIG.models.includes(car.model) && car.price <= CONFIG.maxPrice
        );

        const fresh = filtered.filter(car => !cachedVINs.has(car.vin));

        if (fresh.length > 0) hasNewCars = true;

        for (const car of fresh) {
            cachedVINs.add(car.vin);
            const text = `🚗 Новая машина!
${car.year} ${car.model}
Цена: $${car.price}
Пробег: ${car.odometer} миль
Место: ${car.city}, ${car.state}
VIN: ${car.vin}
Дата добавления: ${car.addedDate}
🔗 https://www.tesla.com/m3/order/${car.vin}`;
            await sendToTelegram(text);
        }

        if (fresh.length === 0) {
            console.log("❌ Новых машин нет:", new Date().toLocaleTimeString());
        }

    } catch (error) {
        console.error("❌ Ошибка запроса:", error.response?.status, error.message);
    }
}

// Мониторинг с джиттером
async function startMonitoring() {
    while (true) {
        const jitter = Math.floor(Math.random() * (CONFIG.jitterSec * 2 + 1)) - CONFIG.jitterSec;
        await fetchCars();
        const interval = (CONFIG.checkIntervalSec + jitter) * 1000;
        await new Promise(res => setTimeout(res, interval));
    }
}

// Первый запуск
startMonitoring();

// Уведомление, если новых машин нет за 60 секунд
setInterval(() => {
    if (!hasNewCars) {
        sendToTelegram(`❌ Братан, Новых машин нет: ${new Date().toLocaleTimeString()}`);
    }
    hasNewCars = false;
}, 3 * 60 * 60 * 1000);

// Запуск сервера
app.listen(3000, () => console.log("🚀 Сервер запущен на порту 3000"));

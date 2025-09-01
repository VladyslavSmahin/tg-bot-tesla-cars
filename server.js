import express from "express";
import axios from "axios";

const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Конфиг
const CONFIG = {
    intervalSec: 90,      // базовый интервал
    jitterSec: 10,        // ±джиттер
    maxPrice: 25000,
    models: ["Model 3", "Model Y", "Model X"],
    region: "US"
};

let cachedVINs = new Set();

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

        // Фильтр по цене и модели
        const filtered = cars.filter(car =>
            CONFIG.models.includes(car.model) &&
            car.price <= CONFIG.maxPrice
        );

        const fresh = filtered.filter(car => !cachedVINs.has(car.vin));

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
            await sendToTelegram(`❌ Новых машин нет: ${new Date().toLocaleTimeString()}`);
        }

    } catch (error) {
        console.error("❌ Ошибка запроса:", error.response?.status, error.message);
    }
}

// Функция с джиттером
function startMonitoring() {
    const jitter = Math.floor(Math.random() * (CONFIG.jitterSec * 2 + 1)) - CONFIG.jitterSec;
    const interval = (CONFIG.intervalSec + jitter) * 1000;

    fetchCars().finally(() => {
        setTimeout(startMonitoring, interval);
    });
}
cachedVINs.clear();
// Запуск
startMonitoring();

app.listen(3000, () => console.log("🚀 Сервер запущен на порту 3000"));

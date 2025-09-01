import express from "express";
import axios from "axios";

const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let cachedVINs = new Set();
let hasNewCars = false; // флаг для проверки новых машин за последние 30 сек

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
                model: "m3",
                condition: "used",
                arrangeby: "Relevance",
                order: "desc",
                market: "US"
            },
            offset: 0,
            count: 10,
            outsideOffset: 0,
            outsideSearch: false
        }));

        const url = `https://www.tesla.com/inventory/api/v4/inventory-results?query=${query}`;

        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.tesla.com/inventory/used/m3"
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

        const fresh = cars.filter(car => !cachedVINs.has(car.vin));

        if (fresh.length > 0) {
            hasNewCars = true; // появились новые машины
        }

        for (const car of fresh) {
            cachedVINs.add(car.vin);
            const text = `🚗 Новая машина!
${car.year} ${car.model}
Цена: $${car.price}
Пробег: ${car.odometer} миль
Место: ${car.city}, ${car.state}
VIN: ${car.vin},
addedDate: ${car.addedDate}
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

// первый запуск
fetchCars();

// каждые 30 сек проверяем новые машины
setInterval(fetchCars, 30 * 1000);

// каждые 60 сек уведомляем, если новых машин не было
setInterval(() => {
    if (!hasNewCars) {
        sendToTelegram(`❌ Новых машин нет: ${new Date().toLocaleTimeString()}`);

    }
    hasNewCars = false; // сбрасываем флаг для следующего интервала
}, 60 * 1000);

app.listen(3000, () => console.log("🚀 Сервер запущен"));

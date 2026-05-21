/**
 * EcoVolt AI - Main JavaScript File
 * Handles UI interactions, Map, APIs, Calculator, and AI Chatbot.
 */

// ==========================================================================
// 1. Navigation & UI Logic
// ==========================================================================
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');
const navBtns = document.querySelectorAll('.nav-btn');

// Mobile Menu Toggle
hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('toggle');
});

// Smooth Scroll & Active State
navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Remove active class from all
        navBtns.forEach(b => b.classList.remove('active'));
        // Add to clicked
        e.target.classList.add('active');
        // Close mobile menu if open
        if (navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
        }
    });
});

// Update active nav based on scroll position
const sections = document.querySelectorAll('.slide');
const mainContainer = document.querySelector('html'); // using html for scroll-snap

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= (sectionTop - sectionHeight / 3)) {
            current = section.getAttribute('id');
        }
    });

    navBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('href').includes(current)) {
            btn.classList.add('active');
        }
    });
});

// ==========================================================================
// 2. Map & Geolocation (Slide 1)
// ==========================================================================
let map;
let marker;
const defaultLat = 20.5937; // Center of India
const defaultLng = 78.9629;
let currentLat = defaultLat;
let currentLng = defaultLng;

function initMap() {
    // Initialize map
    map = L.map('map').setView([defaultLat, defaultLng], 5);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Try to get user location
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                updateLocation(position.coords.latitude, position.coords.longitude, 12);
            },
            (error) => {
                console.log("Geolocation denied or error. Using default India center.", error);
            }
        );
    }

    // Map click event
    map.on('click', function(e) {
        updateLocation(e.latlng.lat, e.latlng.lng, map.getZoom());
    });
}

function updateLocation(lat, lng, zoom = 12) {
    currentLat = lat;
    currentLng = lng;
    
    map.setView([lat, lng], zoom);
    
    if (marker) {
        marker.setLatLng([lat, lng]);
    } else {
        marker = L.marker([lat, lng]).addTo(map);
    }
    
    // Fetch new data for the selected location
    fetchWeatherData(lat, lng);
    fetchSolarData(lat, lng);
}

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', initMap);


// ==========================================================================
// 3. API Data Fetching (Wind & Solar)
// ==========================================================================
async function fetchWeatherData(lat, lng) {
    try {
        // Open-Meteo API for current weather & wind
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset,uv_index_max&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        
        updateWindUI(data.current);
        updateSolarUI_Basic(data.current, data.daily);
        
    } catch (error) {
        console.error("Error fetching weather data:", error);
    }
}

let solarChartInstance = null;

async function fetchSolarData(lat, lng) {
    try {
        // Open-Meteo API for hourly solar irradiance
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=shortwave_radiation&forecast_days=1&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        
        updateSolarChart(data.hourly.time, data.hourly.shortwave_radiation);
        analyzeSolarPotential(data.hourly.shortwave_radiation);
        
    } catch (error) {
        console.error("Error fetching solar data:", error);
    }
}

// ==========================================================================
// 4. Data Processing & UI Updates
// ==========================================================================
function updateWindUI(current) {
    const windSpeed = current.wind_speed_10m; // km/h
    
    document.getElementById('wind-speed').innerHTML = `${windSpeed} <small>km/h</small>`;
    document.getElementById('wind-direction').innerHTML = `${current.wind_direction_10m} <small>°</small>`;
    document.getElementById('air-pressure').innerHTML = `${current.pressure_msl} <small>hPa</small>`;
    document.getElementById('temperature').innerHTML = `${current.temperature_2m} <small>°C</small>`;

    // Classify wind
    const classEl = document.getElementById('wind-classification');
    const recEl = document.getElementById('wind-recommendation');
    
    if (windSpeed < 10) {
        classEl.innerText = "Poor";
        classEl.style.color = "#ef4444"; // red
        recEl.innerText = "Not recommended for wind setups. Wind speeds are too low for significant generation.";
    } else if (windSpeed >= 10 && windSpeed < 20) {
        classEl.innerText = "Average";
        classEl.style.color = "#f59e0b"; // yellow
        recEl.innerText = "Suitable for small hybrid (solar+wind) systems. A micro-turbine could supplement power.";
    } else if (windSpeed >= 20 && windSpeed < 30) {
        classEl.innerText = "Good";
        classEl.style.color = "var(--neon-green)";
        recEl.innerText = "Good potential. Suitable for small home or farm turbines.";
    } else {
        classEl.innerText = "Excellent";
        classEl.style.color = "var(--cyan-highlight)";
        recEl.innerText = "Excellent wind potential. Highly recommended for standalone wind setups or farm usage.";
    }
}

function updateSolarUI_Basic(current, daily) {
    document.getElementById('uv-index').innerText = daily.uv_index_max[0] || '--';
    document.getElementById('cloud-cover').innerHTML = `${current.cloud_cover} <small>%</small>`;
    
    // Format time (YYYY-MM-DDTHH:MM)
    const formatTime = (timeStr) => {
        if (!timeStr) return '--:--';
        return new Date(timeStr).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };
    
    document.getElementById('sunrise-time').innerText = formatTime(daily.sunrise[0]);
    document.getElementById('sunset-time').innerText = formatTime(daily.sunset[0]);
}

function analyzeSolarPotential(radiationArray) {
    // Calculate daily total irradiance (approximation) W/m² to Wh/m²
    const dailyTotalWh = radiationArray.reduce((sum, val) => sum + (val || 0), 0);
    const avgKwh = dailyTotalWh / 1000; // kWh/m²/day
    
    const classEl = document.getElementById('solar-classification');
    const recEl = document.getElementById('solar-recommendation');
    
    if (avgKwh < 3) {
        classEl.innerText = "Low Potential";
        classEl.style.color = "#ef4444";
        recEl.innerText = "Low sunlight detected. Solar may not be cost-effective unless heavily subsidized.";
    } else if (avgKwh >= 3 && avgKwh < 4.5) {
        classEl.innerText = "Moderate";
        classEl.style.color = "#f59e0b";
        recEl.innerText = "Good for rooftop solar. Can offset a significant portion of your energy bill.";
    } else if (avgKwh >= 4.5 && avgKwh < 6) {
        classEl.innerText = "High";
        classEl.style.color = "var(--neon-green)";
        recEl.innerText = "Excellent for rooftop and agricultural solar pumps. Fast ROI expected.";
    } else {
        classEl.innerText = "Excellent";
        classEl.style.color = "var(--cyan-highlight)";
        recEl.innerText = "Outstanding solar potential. Ideal for off-grid setups, apartment complexes, and large farms.";
    }
}

function updateSolarChart(labelsRaw, dataRaw) {
    const ctx = document.getElementById('solarChart').getContext('2d');
    
    // Format labels to just time
    const labels = labelsRaw.map(l => new Date(l).getHours() + ':00');
    
    if (solarChartInstance) {
        solarChartInstance.destroy();
    }
    
    solarChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Solar Irradiance (W/m²)',
                data: dataRaw,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

// ==========================================================================
// 5. Energy Generation Calculator (Slide 3)
// ==========================================================================
document.getElementById('calc-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const panels = parseFloat(document.getElementById('panels').value) || 0;
    const wattage = parseFloat(document.getElementById('wattage').value) || 0;
    const ebBill = parseFloat(document.getElementById('eb-bill').value) || 0;
    const batteryAh = parseFloat(document.getElementById('battery-size').value) || 0;
    
    // Assumptions for Indian context
    const avgSunlightHours = 5; // average peak sun hours in India
    const systemLosses = 0.80; // 20% loss (dust, heat, inverter inefficiency)
    const costPerKwh = 7; // Average ₹7 per unit
    const costPerWatt = 50; // Approx installation cost ₹50/W
    
    // Calculations
    const systemCapacityKw = (panels * wattage) / 1000;
    const dailyGenKwh = systemCapacityKw * avgSunlightHours * systemLosses;
    const monthlyGenKwh = dailyGenKwh * 30;
    
    const financialSavings = monthlyGenKwh * costPerKwh;
    const actualSavings = Math.min(financialSavings, ebBill); // Can't save more than bill unless net metering
    
    // Battery calculation (assuming 12V system)
    const batteryWh = batteryAh * 12;
    const usableBatteryWh = batteryWh * 0.5; // 50% depth of discharge for lead acid
    const batteryBackupHrs = usableBatteryWh / 500; // Assuming 500W constant load
    
    // Carbon reduction (approx 0.82 kg CO2 per kWh in India)
    const carbonReduction = monthlyGenKwh * 0.82;
    
    // ROI
    const totalCost = (systemCapacityKw * 1000 * costPerWatt) + (batteryAh * 150); // rough battery cost
    const yearlySavings = actualSavings * 12;
    const roiYears = yearlySavings > 0 ? (totalCost / yearlySavings).toFixed(1) : '∞';
    
    // Update UI
    document.getElementById('daily-gen').innerHTML = `${dailyGenKwh.toFixed(1)} <small>kWh</small>`;
    document.getElementById('monthly-savings').innerText = `₹ ${Math.round(actualSavings).toLocaleString('en-IN')}`;
    document.getElementById('carbon-reduction').innerHTML = `${Math.round(carbonReduction)} <small>kg</small>`;
    document.getElementById('battery-backup').innerHTML = batteryAh > 0 ? `${batteryBackupHrs.toFixed(1)} <small>hrs (at 500W load)</small>` : '0 <small>hrs</small>';
    document.getElementById('roi-time').innerText = `${roiYears} Years`;
});

// ==========================================================================
// 6. Product Recommendations (Slide 4)
// ==========================================================================
const products = [
    { type: 'solar', name: 'Luminous 330W Polycrystalline', specs: '330W | 17% Efficiency | 25yr warranty', price: '₹ 9,500', img: '☀️', tag: 'Best Value' },
    { type: 'solar', name: 'Waaree 540W Monocrystalline', specs: '540W | 21% Efficiency | Half-cut cells', price: '₹ 14,000', img: '⚡', tag: 'Premium' },
    { type: 'solar', name: 'Tata Power 400W Mono PERC', specs: '400W | 20% Efficiency | High durability', price: '₹ 12,000', img: '🌞', tag: 'Popular' },
    { type: 'inverter', name: 'Microtek 1135 Solar Inverter', specs: '12V | PWM Charge Controller', price: '₹ 6,500', img: '🔋', tag: 'Budget' },
    { type: 'inverter', name: 'Luminous NXG 1450', specs: '12V | Intelligent Solar Optimization', price: '₹ 8,200', img: '🔌', tag: 'Best Seller' },
    { type: 'wind', name: 'Luminous 1kW Wind Turbine', specs: '1kW | Low wind start | Hybrid ready', price: '₹ 45,000', img: '🌬️', tag: 'Premium' },
    { type: 'wind', name: 'Generic 400W Micro Turbine', specs: '400W | Roof mountable | 12V/24V', price: '₹ 15,000', img: '🌪️', tag: 'Budget' },
];

function renderProducts(filter = 'all') {
    const container = document.getElementById('product-container');
    container.innerHTML = '';
    
    products.forEach(p => {
        if (filter !== 'all' && p.type !== filter) return;
        
        const card = document.createElement('div');
        card.className = 'glass-card product-card';
        card.style.position = 'relative';
        
        card.innerHTML = `
            ${p.tag ? `<span class="badge">${p.tag}</span>` : ''}
            <div class="product-image">${p.img}</div>
            <div class="product-details">
                <h3>${p.name}</h3>
                <p class="product-specs">${p.specs}</p>
                <div class="product-price">${p.price}</div>
            </div>
            <button class="btn" onclick="window.open('https://www.amazon.in/s?k=${encodeURIComponent(p.name)}', '_blank')">Search on Amazon</button>
        `;
        container.appendChild(card);
    });
}

// Product Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderProducts(e.target.dataset.filter);
    });
});

// Initial Render
renderProducts();

// ==========================================================================
// 7. AI Chatbot Assistant (Slide 5)
// ==========================================================================

// Using Pollinations AI for completely free, keyless AI responses
const AI_API_URL = "https://text.pollinations.ai/";

const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

function appendMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.innerHTML = `<div class="bubble">${text}</div>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    // Save to local storage
    saveChatHistory();
}

function showTyping() {
    const div = document.createElement('div');
    div.className = `message bot typing`;
    div.id = 'typing-indicator';
    div.innerHTML = `
        <div class="bubble">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

async function handleChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    appendMessage(text, 'user');
    chatInput.value = '';
    
    showTyping();
    
    try {
        const prompt = `You are an expert AI assistant for a renewable energy platform in India. Answer concisely and practically. User asks: ${text}`;
        
        // Pollinations text endpoint is completely free and requires no API key
        const response = await fetch(AI_API_URL + encodeURIComponent(prompt));
        
        if (!response.ok) throw new Error("Network response was not ok");
        
        const aiText = await response.text();
        removeTyping();
        
        // Basic markdown to HTML (bolding and line breaks)
        const formattedText = aiText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
            
        appendMessage(formattedText, 'bot');
        
    } catch (error) {
        console.error("AI Error:", error);
        removeTyping();
        appendMessage("An error occurred while connecting to the AI. Please try again later.", 'bot');
    }
}

sendBtn.addEventListener('click', handleChat);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
});

// Local Storage for Chat
function saveChatHistory() {
    const messages = [];
    document.querySelectorAll('.message').forEach(msg => {
        if (msg.id === 'typing-indicator') return;
        messages.push({
            sender: msg.classList.contains('bot') ? 'bot' : 'user',
            text: msg.querySelector('.bubble').innerHTML
        });
    });
    localStorage.setItem('ecovolt_chat', JSON.stringify(messages));
}

function loadChatHistory() {
    const saved = localStorage.getItem('ecovolt_chat');
    if (saved) {
        chatBox.innerHTML = ''; // Clear default
        const messages = JSON.parse(saved);
        messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.sender}`;
            div.innerHTML = `<div class="bubble">${msg.text}</div>`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// Load chat on startup
document.addEventListener('DOMContentLoaded', loadChatHistory);

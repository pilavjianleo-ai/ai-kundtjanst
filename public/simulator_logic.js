
/* ========================
   PRODUCT SIMULATOR LOGIC
   Handles image generation and simulation
======================== */

async function generateSimulation() {
    const name = document.getElementById("simProductName")?.value?.trim();
    const category = document.getElementById("simProductCategory")?.value;
    const room = document.getElementById("simRoomType")?.value;
    const style = document.getElementById("simRoomStyle")?.value;

    if (!name) {
        toast("Namn saknas", "Vänligen ange ett produktnamn", "error");
        return;
    }

    const btn = document.getElementById("simGenerateBtn");
    const resultArea = document.getElementById("simResultArea");
    const resultImg = document.getElementById("simResultImage");
    const resultPrompt = document.getElementById("simResultPrompt");

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Genererar...`;
    }

    try {
        const data = await api("/simulator/generate", {
            method: "POST",
            body: {
                productName: name,
                category: category,
                roomType: room,
                style: style
            }
        });

        if (data.imageUrl) {
            if (resultArea) resultArea.style.display = "block";
            if (resultImg) resultImg.src = data.imageUrl;
            if (resultPrompt) resultPrompt.textContent = "AI Prompt: " + (data.prompt || "");

            saveSimToHistory(data);
            loadSimHistory();
            toast("Klar!", "Visualiseringen har genererats", "ok");
        }
    } catch (e) {
        toast("Fel", e.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generera Visualisering`;
        }
    }
}

function saveSimToHistory(data) {
    let history = JSON.parse(localStorage.getItem("simHistory") || "[]");
    history.unshift({
        url: data.imageUrl,
        name: data.productName,
        date: new Date().toISOString()
    });
    localStorage.setItem("simHistory", JSON.stringify(history.slice(0, 10)));
}

function loadSimHistory() {
    const list = document.getElementById("simHistoryList");
    if (!list) return;

    const history = JSON.parse(localStorage.getItem("simHistory") || "[]");
    if (history.length === 0) {
        list.innerHTML = `<div class="muted small">Ingen historik ännu</div>`;
        return;
    }

    list.innerHTML = history.map(h => `
        <div class="historyItem" onclick="showHistorySim('${h.url}')" style="cursor:pointer; flex-shrink:0;">
            <img src="${h.url}" style="width:80px; height:80px; border-radius:8px; object-fit:cover; border:1px solid var(--border);">
            <div class="tiny muted" style="max-width:80px; overflow:hidden; text-overflow:ellipsis;">${h.name}</div>
        </div>
    `).join("");
}

function showHistorySim(url) {
    const resultArea = document.getElementById("simResultArea");
    const resultImg = document.getElementById("simResultImage");
    if (resultArea) resultArea.style.display = "block";
    if (resultImg) resultImg.src = url;
}

// Global setup
document.addEventListener("DOMContentLoaded", () => {
    const genBtn = document.getElementById("simGenerateBtn");
    if (genBtn) genBtn.onclick = generateSimulation;

    // Check if we are in simulatorView periodically or on showView
    loadSimHistory();
});

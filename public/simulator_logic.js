
/* ========================
   SIMULATOR LOGIC
   Handles product visualization
======================== */
async function generateSimulation() {
    const btn = document.getElementById("simGenerateBtn");
    const resultArea = document.getElementById("simResultArea");
    const img = document.getElementById("simResultImage");
    const promptText = document.getElementById("simResultPrompt");

    if (!btn || !resultArea) return;

    const productName = document.getElementById("simProductName")?.value;
    const productCategory = document.getElementById("simProductCategory")?.value;
    const roomType = document.getElementById("simRoomType")?.value;
    const style = document.getElementById("simStyle")?.value;

    if (!productName) {
        toast("Fel", "Ange ett produktnamn", "error");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Genererar...`;
    resultArea.style.display = "none";

    try {
        const res = await api("/simulator/generate", {
            method: "POST",
            body: {
                productName,
                productCategory,
                roomTypeSelect: roomType,
                roomStyle: style,
                roomType: "ai", // default for now
                placement: "center",
                lighting: "daylight",
                angle: "front"
            }
        });

        if (res.imageUrl) {
            img.src = res.imageUrl;
            promptText.textContent = res.revisedPrompt || res.prompt;
            resultArea.style.display = "block";
            toast("Klart", "Visualisering genererad", "success");
        } else {
            toast("Fel", "Kunde inte generera bild", "error");
        }

    } catch (e) {
        toast("Fel", e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `Generera Visualisering`;
    }
}

// History loader
async function loadSimHistory() {
    const list = document.getElementById("simHistoryList");
    if (!list) return;

    try {
        const history = await api("/simulator/history");
        if (!history || history.length === 0) {
            list.innerHTML = `<div class="muted center">Ingen historik än.</div>`;
            return;
        }

        list.innerHTML = history.map(h => `
            <div class="simHistoryItem" onclick="showSimResult('${h.imageUrl}', '${h.prompt}')">
                <img src="${h.imageUrl}" style="width:60px; height:60px; object-fit:cover; border-radius:4px;">
                <div>
                   <div style="font-weight:600;">${h.productName}</div>
                   <div class="muted small">${new Date(h.createdAt).toLocaleDateString()}</div>
                </div>
            </div>
        `).join("");

    } catch (e) {
        console.error(e);
    }
}

function showSimResult(url, prompt) {
    const resultArea = document.getElementById("simResultArea");
    const img = document.getElementById("simResultImage");
    const promptText = document.getElementById("simResultPrompt");

    if (img) img.src = url;
    if (promptText) promptText.textContent = prompt;
    if (resultArea) resultArea.style.display = "block";
}

// Hook up button
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("simGenerateBtn");
    if (btn) btn.addEventListener("click", generateSimulation);

    // Auto-load history when view is shown?
    // We can hook into global showView or just rely on manual refresh/click
});

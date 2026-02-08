
// --- MOBILE OPTIMIZATION ---
window.toggleSidebar = function () {
    const sb = document.querySelector('.sidebar');
    const ov = document.querySelector('.mobile-overlay');
    if (sb) sb.classList.toggle('active');
    if (ov) ov.classList.toggle('active');

    if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
    } else {
        document.body.style.overflow = 'hidden';
    }
};

function initMobileMenu() {
    // Inject overlay for mobile sidebar if not present
    if (!document.querySelector('.mobile-overlay')) {
        const ov = document.createElement('div');
        ov.className = 'mobile-overlay';
        ov.onclick = window.toggleSidebar;
        document.body.appendChild(ov);
    }

    const topbars = document.querySelectorAll('.topbar');
    topbars.forEach(tb => {
        const titleContainer = tb.firstElementChild;
        if (titleContainer && !titleContainer.querySelector('.mobile-menu-btn')) {
            const btn = document.createElement('button');
            btn.className = 'mobile-menu-btn';
            btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
            btn.type = 'button';
            btn.onclick = window.toggleSidebar;

            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.gap = '10px';

            titleContainer.insertBefore(btn, titleContainer.firstChild);
        }
    });

    document.querySelectorAll('.menuBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 900) {
                document.querySelector('.sidebar')?.classList.remove('active');
                document.querySelector('.mobile-overlay')?.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
}

// Function to set chat input (used by Intro Screen buttons)
window.setChatInput = function (text) {
    const input = document.getElementById("messageInput");
    if (input) {
        input.value = text;
        // Optionally focus, but sending immediately makes focus less important (though good for keyboard users if send fails)
        input.focus();

        // Auto-send immediately as requested
        if (typeof sendChat === 'function') {
            sendChat();
        } else if (window.sendChat) {
            window.sendChat();
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    initMobileMenu();
}

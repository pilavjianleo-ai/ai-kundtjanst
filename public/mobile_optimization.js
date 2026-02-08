
// --- MOBILE OPTIMIZATION ---
window.toggleSidebar = function () {
    const sb = document.querySelector('.sidebar');
    const ov = document.querySelector('.mobile-overlay');
    if (sb) sb.classList.toggle('active');
    if (ov) ov.classList.toggle('active');

    // Prevent background scrolling when menu represents overlay
    if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
    } else {
        document.body.style.overflow = 'hidden';
    }
};

function initMobileMenu() {
    const topbars = document.querySelectorAll('.topbar');
    topbars.forEach(tb => {
        const titleContainer = tb.firstElementChild;
        if (titleContainer && !titleContainer.querySelector('.mobile-menu-btn')) {
            const btn = document.createElement('button');
            btn.className = 'mobile-menu-btn';
            btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
            btn.type = 'button'; // Prevent form submission
            btn.onclick = window.toggleSidebar;

            // Style container to show button inline
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.gap = '10px';

            titleContainer.insertBefore(btn, titleContainer.firstChild);
        }
    });

    // Close menu on click (mobile)
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

// Ensure init runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    // If loaded late, run immediately
    initMobileMenu();
}

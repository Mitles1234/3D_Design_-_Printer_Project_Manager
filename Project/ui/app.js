const pill = document.querySelector('.nav-pill');

function navigate(url, el) {
    if (el) {
        const rect = el.getBoundingClientRect();
        const headerRect = el.closest('header').getBoundingClientRect();
        pill.style.left = (rect.left - headerRect.left) + 'px';
        pill.style.width = rect.width + 'px';
    }

    if (!url.startsWith('http')) {
        document.getElementById('content').src = url;
        return;
    }

    fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(3000) })
        .then(() => document.getElementById('content').src = url)
        .catch(() => document.getElementById('content').src = 'error.html');
}

// Set pill to first link on startup
window.addEventListener('DOMContentLoaded', () => {
    const firstLink = document.querySelector('header a');
    if (firstLink) firstLink.click();
});
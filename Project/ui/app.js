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

    fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(20) })
        .then(() => document.getElementById('content').src = url)
        .catch(() => {
            document.getElementById('content').src = 'equipment.html';
            showToast('Failed to load page, Please check the 3D Printer Settings', true);
        });
}

// Set pill to first link on startup
window.addEventListener('DOMContentLoaded', () => {
    const firstLink = document.querySelector('header a');
    if (firstLink) firstLink.click();
});



function OpenSettingsModal() {
    document.getElementById('settings-modal').classList.add('open');
}
 
function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('open');
}
 
function confirmSettingsModal() {
    //For When I have Inputs that the user can set lol
 
    closeSettingsModal();
}
 
// click outside the modal box to close it
document.getElementById('settings-modal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('settings-modal')) {
        closeSettingsModal();
    }
});
 
window.OpenSettingsModal = OpenSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.confirmSettingsModal = confirmSettingsModal;
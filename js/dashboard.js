// Shared restaurant dashboard interactions.
function toggleUserDropdown(event) {
    event?.stopPropagation();
    const wrapper = document.getElementById('userDropdownWrapper');
    if (wrapper) wrapper.classList.toggle('open');
}

function closeUserDropdown() {
    document.getElementById('userDropdownWrapper')?.classList.remove('open');
}

document.addEventListener('click', function (event) {
    const wrapper = document.getElementById('userDropdownWrapper');
    if (wrapper && !wrapper.contains(event.target)) closeUserDropdown();
});

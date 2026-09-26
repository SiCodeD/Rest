/**
 * Custom Single Select Component
 * Enhanced, clean design matching the app's aesthetic
 */

(function () {
    'use strict';

    // Initialize all selects
    function init() {
        document.querySelectorAll('select.select-modern').forEach(convertSelect);

        // Global click to close dropdowns
        document.addEventListener('click', function () {
            closeAllDropdowns();
        });

        // Keyboard accessibility
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeAllDropdowns();
            }
        });
    }

    function convertSelect(nativeSelect) {
        if (nativeSelect.dataset.initialized === 'true') return;
        nativeSelect.dataset.initialized = 'true';

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'custom-select-button';
        button.innerHTML = `
            <span class="custom-select-value"></span>
            <i data-lucide="chevron-down" class="custom-select-arrow lucide-icon"></i>
        `;

        const dropdown = document.createElement('div');
        dropdown.className = 'custom-select-dropdown';

        // Render options
        renderOptions(nativeSelect, button, dropdown);

        // Click handler for button
        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleDropdown(wrapper, dropdown, button);
        });

        wrapper.appendChild(button);

        // Insert wrapper and hide native select
        nativeSelect.parentNode.insertBefore(wrapper, nativeSelect);
        nativeSelect.style.display = 'none';
        wrapper.nativeSelect = nativeSelect;

        // Store reference
        if (nativeSelect.id) {
            window['customSelect_' + nativeSelect.id] = {
                wrapper: wrapper,
                dropdown: dropdown,
                button: button,
                refresh: () => renderOptions(nativeSelect, button, dropdown)
            };
        }
    }

    function renderOptions(nativeSelect, button, dropdown) {
        dropdown.innerHTML = '';
        let selectedText = '';

        Array.from(nativeSelect.options).forEach((option, index) => {
            const optionEl = document.createElement('div');
            optionEl.className = 'custom-select-option' + (option.selected ? ' selected' : '');
            optionEl.innerHTML = option.text;
            optionEl.dataset.value = option.value;
            optionEl.dataset.index = index;

            if (option.selected) {
                selectedText = option.text;
            }

            optionEl.addEventListener('click', function (e) {
                e.stopPropagation();
                selectOption(nativeSelect, button, dropdown, option.value, option.text);
            });

            dropdown.appendChild(optionEl);
        });

        // Update button text
        const valueSpan = button.querySelector('.custom-select-value');
        if (valueSpan) {
            valueSpan.textContent = selectedText || nativeSelect.options[0]?.text || '';
            valueSpan.className = 'custom-select-value' + (!selectedText ? ' placeholder' : '');
        }
    }

    function selectOption(nativeSelect, button, dropdown, value, text) {
        // Update native select
        nativeSelect.value = value;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));

        // Update UI
        const valueSpan = button.querySelector('.custom-select-value');
        if (valueSpan) {
            valueSpan.textContent = text;
            valueSpan.className = 'custom-select-value';
        }

        // Update selected state on options
        dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
            if (opt.dataset.value === value) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });

        // Close dropdown
        closeDropdown(dropdown);
    }

    function toggleDropdown(wrapper, dropdown, button) {
        const isOpen = dropdown.classList.contains('open');

        closeAllDropdowns();

        if (!isOpen) {
            // Append dropdown to body to avoid stacking context issues
            if (!document.body.contains(dropdown)) {
                document.body.appendChild(dropdown);
            }

            dropdown.classList.add('open');
            wrapper.classList.add('open');

            // Position dropdown correctly
            const rect = button.getBoundingClientRect();

            dropdown.style.top = (rect.bottom + window.scrollY + 8) + 'px';
            dropdown.style.left = (rect.left + window.scrollX) + 'px';
            dropdown.style.width = rect.width + 'px';

            // Ensure dropdown doesn't go off screen
            setTimeout(() => {
                const dropdownRect = dropdown.getBoundingClientRect();
                if (dropdownRect.right > window.innerWidth) {
                    dropdown.style.left =
                        (window.innerWidth - dropdownRect.width - 20 + window.scrollX) + 'px';
                }

                if (dropdownRect.bottom > window.innerHeight + window.scrollY) {
                    dropdown.style.top =
                        (rect.top + window.scrollY - dropdownRect.height - 8) + 'px';
                }
            }, 10);

            // Bring the parent card to front
            const parentCard = wrapper.closest('.card, .table-card, .attendance-container');
            if (parentCard) {
                parentCard.classList.add('dropdown-open');
            }
        }
    }

    function closeDropdown(dropdown) {
        dropdown.classList.remove('open');
        const wrapper = document.querySelector('.custom-select-wrapper:has(+ select[data-initialized])') ||
            document.querySelector('.custom-select-wrapper');
        if (wrapper) {
            wrapper.classList.remove('open');
            // Remove the parent card class
            const parentCard = wrapper.closest('.card, .table-card, .attendance-container');
            if (parentCard) {
                parentCard.classList.remove('dropdown-open');
            }
        }
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.custom-select-dropdown.open').forEach(d => {
            d.classList.remove('open');
            const wrapper = document.querySelector('.custom-select-wrapper.open');
            if (wrapper) {
                wrapper.classList.remove('open');
                const parentCard = wrapper.closest('.card, .table-card, .attendance-container');
                if (parentCard) {
                    parentCard.classList.remove('dropdown-open');
                }
            }
        });
    }

    // Global API
    window.CustomSelect = {
        init,
        refresh: function (idOrElement) {
            let element;
            if (typeof idOrElement === 'string') {
                element = document.getElementById(idOrElement);
            } else if (idOrElement) {
                element = idOrElement;
            }

            if (!element) return;

            const selectData = window['customSelect_' + element.id];
            if (selectData) {
                // Already initialized - just refresh options
                renderOptions(selectData.wrapper.nativeSelect, selectData.button, selectData.dropdown);
            } else if (element.classList.contains('select-modern')) {
                // Not initialized yet - initialize it first
                convertSelect(element);
            }
        }
    };

    // Initialize on DOM load and after any delay
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    setTimeout(init, 200);
    setTimeout(init, 1000);
})();

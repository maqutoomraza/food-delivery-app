document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    
    // ## NEW: Selectors for the password toggle ##
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');

    // ## NEW: Event listener for the icon ##
    togglePassword.addEventListener('click', () => {
        // Toggle the type attribute
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Toggle the icon text
        togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
    });

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorMessage.textContent = '';

        const username = document.getElementById('username').value;
        const password = passwordInput.value; // Use the selector

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('userRole', data.role);
                window.location.href = '/admin.html';
            } else {
                errorMessage.textContent = 'Invalid username or password.';
            }
        } catch (error) {
            console.error('Login fetch error:', error);
            errorMessage.textContent = 'Could not connect to the server.';
        }
    });
});
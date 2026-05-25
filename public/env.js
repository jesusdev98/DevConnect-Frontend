window.__DEVCONNECT_CONFIG__ = window.__DEVCONNECT_CONFIG__ || {};

if (!window.__DEVCONNECT_CONFIG__.apiUrl && typeof window !== 'undefined' && window.location) {
	const hostname = window.location.hostname;
	const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
	const isCypress = Boolean(window.Cypress);

	if (isLocalhost) {
		window.__DEVCONNECT_CONFIG__.apiUrl = isCypress ? window.location.origin : 'http://127.0.0.1:8001';
	} else {
		window.__DEVCONNECT_CONFIG__.apiUrl = window.location.origin;
	}
}

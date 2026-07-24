const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const CALLBACK_NAME = '__gmapsPlacesCallback';
let mapsReadyPromise = null;

/**
 * Load Maps JS + Places with Google's recommended loading=async + callback.
 * Shared by EventBuilder and ClubManager so only one script is injected.
 * @returns {Promise<typeof google>}
 */
export function loadGoogleMaps() {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (!GOOGLE_MAPS_KEY) {
        return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not set. Add it to your host env (e.g. Vercel) and redeploy.'));
    }
    if (window.google?.maps?.places?.Autocomplete) {
        return Promise.resolve(window.google);
    }
    if (mapsReadyPromise) return mapsReadyPromise;

    mapsReadyPromise = new Promise((resolve, reject) => {
        const finish = () => {
            if (window.google?.maps?.places?.Autocomplete) {
                resolve(window.google);
                return;
            }
            mapsReadyPromise = null;
            reject(new Error('Google Places Autocomplete unavailable after script load'));
        };

        const previous = window[CALLBACK_NAME];
        window[CALLBACK_NAME] = () => {
            try {
                if (typeof previous === 'function') previous();
            } catch {
                /* ignore */
            }
            finish();
        };

        const existing = document.querySelector('script[data-google-maps]');
        if (existing) {
            if (window.google?.maps?.places?.Autocomplete) {
                finish();
                return;
            }
            // Script already requested — poll briefly in case callback already fired.
            let tries = 0;
            const poll = setInterval(() => {
                tries += 1;
                if (window.google?.maps?.places?.Autocomplete) {
                    clearInterval(poll);
                    finish();
                } else if (tries > 100) {
                    clearInterval(poll);
                    mapsReadyPromise = null;
                    reject(new Error('Timed out waiting for Google Maps Places'));
                }
            }, 50);
            return;
        }

        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&libraries=places&loading=async&callback=${CALLBACK_NAME}`;
        s.async = true;
        s.defer = true;
        s.setAttribute('data-google-maps', 'true');
        s.onerror = () => {
            mapsReadyPromise = null;
            reject(new Error('Google Maps script failed to load'));
        };
        document.head.appendChild(s);
    });

    return mapsReadyPromise;
}

/**
 * Attach legacy Places Autocomplete to a visible text input (EventBuilder pattern).
 *
 * @param {HTMLInputElement} inputEl
 * @param {{
 *   country?: string,
 *   onPlace?: (place: google.maps.places.PlaceResult) => void,
 * }} [options]
 * @returns {Promise<{ destroy: () => void }>}
 */
export async function attachPlacesAutocomplete(inputEl, options = {}) {
    const { country = 'za', onPlace } = options;
    if (!inputEl) throw new Error('Address input is required');

    const google = await loadGoogleMaps();
    if (!google?.maps?.places?.Autocomplete) {
        throw new Error('Google Places Autocomplete is not available');
    }

    const ac = new google.maps.places.Autocomplete(inputEl, {
        fields: ['formatted_address', 'address_components', 'geometry', 'name'],
        types: ['establishment', 'geocode'],
        componentRestrictions: { country },
    });

    const listener = ac.addListener('place_changed', () => {
        onPlace?.(ac.getPlace());
    });

    return {
        destroy() {
            if (listener && google.maps?.event) {
                google.maps.event.removeListener(listener);
            }
            if (google.maps?.event) {
                google.maps.event.clearInstanceListeners(ac);
            }
        },
    };
}

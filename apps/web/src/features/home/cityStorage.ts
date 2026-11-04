const CITY_KEY = 'after_web_city'
const STATE_KEY = 'after_web_state'

export function readStoredCity(): { city: string; state: string } {
  try {
    return {
      city: localStorage.getItem(CITY_KEY) ?? '',
      state: localStorage.getItem(STATE_KEY) ?? '',
    }
  } catch {
    return { city: '', state: '' }
  }
}

export function persistCity(city: string, state: string) {
  localStorage.setItem(CITY_KEY, city)
  localStorage.setItem(STATE_KEY, state)
}

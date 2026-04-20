import { ref } from 'vue';

export function useGeolocation() {
  const coords = ref(null);
  const error = ref(null);
  const isLoading = ref(true);

  if (!navigator.geolocation) {
    error.value = 'Geolocation is not supported by this browser.';
    isLoading.value = false;
  } else {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        coords.value = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        isLoading.value = false;
      },
      (err) => {
        error.value = err.message;
        isLoading.value = false;
      },
      { timeout: 8000 }
    );
  }

  return { coords, error, isLoading };
}

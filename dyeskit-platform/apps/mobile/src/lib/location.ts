/** The phone's position, once, for placing a village on the map. */
import * as Location from 'expo-location';

export async function currentPosition() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission was not given. You can type the position instead.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy ?? 0 };
}

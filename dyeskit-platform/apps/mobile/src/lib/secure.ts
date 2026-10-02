/** The sign-in token: the phone's secure keychain / keystore. */
import * as SecureStore from 'expo-secure-store';

export const secure = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};

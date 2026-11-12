import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Configuration Supabase manquante. Vérifie le fichier .env.'
  );
}

const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';

const authStorage = {
  getItem: (key: string) =>
    isServerRender ? Promise.resolve(null) : AsyncStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (!isServerRender) await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (!isServerRender) await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

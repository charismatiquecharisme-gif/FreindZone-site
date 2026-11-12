import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';

export default function AuthCallback() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error_description?: string | string[];
  }>();

  const url = Linking.useURL();
  const router = useRouter();
  const processed = useRef(false);
  const [message, setMessage] = useState('Confirmation en cours...');

  useEffect(() => {
    if (processed.current) return;

    async function confirmEmail() {
      try {
        const currentUrl = url ?? '';
        const queryString = currentUrl.split('?')[1]?.split('#')[0] ?? '';
        const hashString = currentUrl.split('#')[1] ?? '';

        const query = new URLSearchParams(queryString);
        const hash = new URLSearchParams(hashString);

        const routeCode = Array.isArray(params.code)
          ? params.code[0]
          : params.code;

        const code = query.get('code') ?? routeCode;

        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');

        const errorDescription =
          hash.get('error_description') ??
          query.get('error_description') ??
          (Array.isArray(params.error_description)
            ? params.error_description[0]
            : params.error_description);

        if (errorDescription) {
          processed.current = true;
          setMessage('Erreur de confirmation : ' + errorDescription);
          return;
        }

        if (!code && (!accessToken || !refreshToken)) {
          if (!currentUrl && !routeCode) return;

          processed.current = true;
          setMessage(
            "Lien incomplet ou expiré. Demande un nouvel e-mail de confirmation."
          );
          return;
        }

        processed.current = true;

        const result = code
          ? await supabase.auth.exchangeCodeForSession(code)
          : await supabase.auth.setSession({
              access_token: accessToken!,
              refresh_token: refreshToken!,
            });

        if (result.error) {
          setMessage('Confirmation impossible : ' + result.error.message);
          return;
        }

        setMessage('E-mail confirmé ! Ouverture de FreindZone...');

        const { data } = await supabase.auth.getSession();

        if (data.session) {
          router.replace('/home');
        } else {
          setMessage("Confirmation reçue, mais la session n'a pas été créée.");
        }
      } catch (error) {
        processed.current = true;
        setMessage(
          error instanceof Error
            ? 'Erreur : ' + error.message
            : 'Une erreur est survenue pendant la confirmation.'
        );
      }
    }

    confirmEmail();
  }, [url, params.code, params.error_description, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#7C5CFC" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080B14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/push-notifications';
import { ThemeProvider } from '../context/theme-context';

const letters = [
  ['F', '#4285FF'],
  ['r', '#6274FF'],
  ['i', '#8064FA'],
  ['e', '#A45BEF'],
  ['n', '#C653DC'],
  ['d', '#DB50C4'],
  ['Z', '#E653B5'],
  ['o', '#ED62A9'],
  ['n', '#F178A1'],
  ['e', '#F58D9B'],
];

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [splashReady, setSplashReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashReady(true), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      authEventReceived = true;
      if (active) {
        setSession(newSession);
        setAuthReady(true);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (!authEventReceived) {
        setSession(error ? null : data.session);
      }
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (!session?.user?.id) return;
    void registerForPushNotifications(session.user.id);
  }, [session?.user?.id]);

  if (!authReady || !splashReady) {
    return (
      <View style={styles.splash}>
        <StatusBar hidden />
        <Text style={styles.brand}>
          {letters.map(([letter, color], index) => (
            <Text key={index} style={{ color }}>
              {letter}
            </Text>
          ))}
        </Text>
        <Text style={styles.signature}>BY ELHAAG</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#080B14' },
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="index" />
        </Stack.Protected>

        <Stack.Protected guard={!!session}>
          <Stack.Screen name="home" />
          <Stack.Screen name="discover" />
          <Stack.Screen name="user-profile" />
          <Stack.Screen name="private" />
          <Stack.Screen name="public" />
          <Stack.Screen name="where" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="stories" />
        </Stack.Protected>

        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 39,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  signature: {
    color: '#B8B8C8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    marginTop: 12,
  },
});

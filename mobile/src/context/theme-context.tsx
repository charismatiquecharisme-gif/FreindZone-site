import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'friendzone_theme';
const DEFAULT_COLOR = '#7C5CFF';

type ThemeContextType = {
  accentColor: string;
  setAccentColor: (color: string) => void;
  themeReady: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  accentColor: DEFAULT_COLOR,
  setAccentColor: () => {},
  themeReady: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accentColor, setAccentColorState] = useState(DEFAULT_COLOR);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((savedColor) => {
        if (active && savedColor) {
          setAccentColorState(savedColor);
        }
      })
      .catch((error) => {
        console.log('Erreur chargement du thème :', error);
      })
      .finally(() => {
        if (active) setThemeReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const setAccentColor = (color: string) => {
    setAccentColorState(color);

    AsyncStorage.setItem(STORAGE_KEY, color).catch((error) => {
      console.log('Erreur sauvegarde du thème :', error);
    });
  };

  return (
    <ThemeContext.Provider
      value={{ accentColor, setAccentColor, themeReady }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}

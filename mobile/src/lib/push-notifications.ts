import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(userId: string) {
  try {
    if (Platform.OS === 'web') return null;

    console.log('ENVIRONNEMENT NOTIFICATIONS :', {
      executionEnvironment: Constants.executionEnvironment,
      appOwnership: Constants.appOwnership,
    });

    // Ne pas initialiser les notifications push à distance dans Expo Go.
    if (
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
      Constants.appOwnership === 'expo'
    ) {
      console.log('Notifications push ignorées dans Expo Go.');
      return null;
    }

    if (!Device.isDevice) {
      console.log('Les notifications push nécessitent un appareil physique.');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications FreindZone',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7C5CFF',
        sound: 'default',
      });
    }

    let permission = await Notifications.getPermissionsAsync();

    if (!permission.granted) {
      permission = await Notifications.requestPermissionsAsync();
    }

    if (!permission.granted) {
      console.log('Autorisation des notifications refusée.');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.log('Identifiant du projet EAS introuvable.');
      return null;
    }

    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;

    const { error } = await supabase
      .from('expo_push_tokens')
      .upsert(
        {
          user_id: userId,
          expo_push_token: token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'expo_push_token' }
      );

    if (error) {
      console.log('Erreur enregistrement jeton push :', error.message);
      return null;
    }

    console.log('Jeton de notification enregistré.');
    return token;
  } catch (error) {
    console.log('Erreur notifications push :', error);
    return null;
  }
}

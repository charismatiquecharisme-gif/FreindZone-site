import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

type NotificationItem = {
  id: string;
  message: string;
  notification_type: string;
  created_at: string;
  read_at: string | null;
};

const COLORS = {
  background: '#080B14',
  card: '#111827',
  primary: '#7C5CFF',
  text: '#FFFFFF',
  muted: '#9CA3AF',
  border: '#263044',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id, message, notification_type, created_at, read_at')
      .eq('recipient_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.log('Erreur chargement notifications :', error);
    } else {
      setItems((data || []) as NotificationItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();

    const channel = supabase
      .channel('notifications-screen')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => loadNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  async function markAsRead(item: NotificationItem) {
    if (item.read_at) return;

    const readAt = new Date().toISOString();
    setItems((previous) =>
      previous.map((notification) =>
        notification.id === item.id
          ? { ...notification, read_at: readAt }
          : notification
      )
    );

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', item.id)
      .eq('recipient_id', auth.user.id);

    if (error) {
      console.log('Erreur lecture notification :', error);
      loadNotifications();
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.headerSpace} />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loader} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>Aucune notification</Text>
          <Text style={styles.emptyText}>
            Tes nouvelles notifications apparaîtront ici.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 24 + insets.bottom },
          ]}
        >
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => markAsRead(item)}
              style={[
                styles.notification,
                !item.read_at && styles.unread,
              ]}
            >
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>
                  {item.notification_type === 'friend_request'
                    ? '👋'
                    : item.notification_type === 'friend_accepted'
                    ? '🤝'
                    : item.notification_type === 'private_message'
                    ? '💬'
                    : '🔔'}
                </Text>
              </View>
              <View style={styles.messageWrap}>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleString('fr-FR')}
                </Text>
              </View>
              {!item.read_at && <View style={styles.dot} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: COLORS.text,
    fontSize: 32,
    lineHeight: 36,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSpace: {
    width: 42,
  },
  loader: {
    marginTop: 50,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 35,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 16,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  list: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  notification: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
  },
  unread: {
    borderColor: COLORS.primary,
    backgroundColor: '#17162C',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#25203F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  messageWrap: {
    flex: 1,
  },
  message: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  date: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 8,
  },
});

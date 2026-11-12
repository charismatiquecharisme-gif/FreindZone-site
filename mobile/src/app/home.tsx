import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../context/theme-context';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';

type HomeStoryBubble = {
  userId: string;
  username: string;
  avatarUrl: string | null;
};

const COLORS = {
  background: '#080B14',
  card: '#111827',
  primary: '#7C5CFF',
  text: '#FFFFFF',
  muted: '#9CA3AF',
  border: '#263044',
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentColor } = useAppTheme();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
const [initials, setInitials] = useState('?');
  const [unreadCount, setUnreadCount] = useState(0);
  const [storyBubbles, setStoryBubbles] = useState<HomeStoryBubble[]>([]);
  const [hasOwnStory, setHasOwnStory] = useState(false);
  useEffect(() => {
    let active = true;

    async function loadAvatar() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
const user = data.user;
const meta = user?.user_metadata || {};
const displayName = String(
  meta.full_name || meta.username || user?.email?.split('@')[0] || '?'
).trim();

const parts = displayName.split(/\s+/).filter(Boolean);
const userInitials = parts.length > 1
  ? parts[0][0] + parts[1][0]
  : parts[0].slice(0, 2);

if (active) setInitials(userInitials.toUpperCase());
        const avatarPath = data.user?.user_metadata?.avatar_path;
        if (!avatarPath) return;

        const { data: signed, error: signedError } = await supabase.storage
          .from('avatars')
          .createSignedUrl(avatarPath, 3600);

        if (signedError) throw signedError;

        if (active && signed?.signedUrl) {
          setAvatarUrl(signed.signedUrl);
        }
      } catch (error) {
        console.log('Erreur chargement photo accueil :', error);
      }
    }

    loadAvatar();

    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    let active = true;

    async function loadStoryBubbles() {
      try {
        const { data: rows, error } = await supabase
          .from('stories')
          .select('user_id,created_at')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (error) throw error;

        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData.user?.id;
        const ownStoryExists = (rows || []).some(
          (row) => row.user_id === currentUserId
        );
        if (active) setHasOwnStory(ownStoryExists);

        const ids = [...new Set(
          (rows || [])
            .map((row) => row.user_id)
            .filter((id) => id !== currentUserId)
        )];

        const { data: profiles, error: profileError } = ids.length
          ? await supabase
              .from('profiles')
              .select('id,full_name,username,avatar_path')
              .in('id', ids)
          : { data: [], error: null };

        if (profileError) throw profileError;

        const bubbles = await Promise.all(ids.map(async (id) => {
          const profile = profiles?.find((item) => item.id === id);
          let photo: string | null = null;

          if (profile?.avatar_path) {
            const { data } = await supabase.storage
              .from('avatars')
              .createSignedUrl(profile.avatar_path, 3600);
            photo = data?.signedUrl || null;
          }

          return {
            userId: id,
            username: profile?.username || profile?.full_name || 'Membre',
            avatarUrl: photo,
          };
        }));

        if (active) setStoryBubbles(bubbles);
      } catch (error) {
        console.log('Erreur chargement bulles stories :', error);
      }
    }

    loadStoryBubbles();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function refreshUnread() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .is('read_at', null);

      if (active && !error) setUnreadCount(count || 0);
    }

    async function listenForNotifications() {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;

      channel = supabase
        .channel('home-notifications-' + data.user.id)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: 'recipient_id=eq.' + data.user.id,
          },
          () => refreshUnread()
        )
        .subscribe();
    }

    refreshUnread();
    listenForNotifications();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const actions = [
    {
      icon: '🔎',
      title: 'Découvrir des membres',
      description: 'Rencontre de nouvelles personnes',
    },
    {
      icon: '💬',
      title: 'Conversation privée',
      description: 'Discute avec une personne en privé',
    },
    {
      icon: '🌍',
      title: 'Discussions publiques',
      description: 'Découvre les conversations autour de toi',
    },
    {
      icon: '📍',
      title: 'Où se trouve… ?',
      description: 'Trouve ton chemin dans les lieux publics',
    },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>FriendZone</Text>
          <Text style={styles.subtitle}>Connecte-toi au monde.</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ouvrir les notifications"
            onPress={() => router.push('/notifications' as never)}
            style={styles.bellButton}
          >
            <Text style={styles.bell}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ouvrir mon profil"
            onPress={() => router.push('/profile' as never)}
            style={[styles.avatar, { backgroundColor: accentColor }]}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.storiesSection}>
        <Text style={styles.storiesSectionTitle}>Stories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesRow}>
          <Pressable style={styles.storyBubble}
            onPress={() => router.push('/stories' as never)}>
            <View style={[styles.storyAvatarWrap, styles.storyOwnAvatar]}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={styles.storyAvatar} />
                : <Text style={styles.storyInitials}>{initials}</Text>}
              {!hasOwnStory && (
                <View style={styles.storyAddBadge}>
                  <Text style={styles.storyAddText}>＋</Text>
                </View>
              )}
            </View>
            <Text style={styles.storyName}>Ma story</Text>
          </Pressable>

          {storyBubbles.map((story) => (
            <Pressable key={story.userId} style={styles.storyBubble}
              onPress={() => router.push({ pathname: '/stories', params: { userId: story.userId } } as never)}>
              <View style={styles.storyAvatarWrap}>
                {story.avatarUrl
                  ? <Image source={{ uri: story.avatarUrl }} style={styles.storyAvatar} />
                  : <Text style={styles.storyInitials}>
                      {story.username.slice(0, 2).toUpperCase()}
                    </Text>}
              </View>
              <Text style={styles.storyName} numberOfLines={1}>
                {story.username}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.welcome, { borderColor: accentColor }]}>
        <Text style={styles.welcomeTitle}>Bienvenue 👋</Text>
        <Text style={styles.welcomeText}>
          Rencontre, échange et découvre des conversations autour de toi.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Que veux-tu faire ?</Text>

      {actions.map((action) => (
        <Pressable
          key={action.title}
          style={({ pressed }) => [
            styles.card,
            pressed && styles.cardPressed,
          ]}
          onPress={() => {
            const routes: Record<string, string> = {
              'Découvrir des membres': '/discover',
              'Conversation privée': '/private',
              'Discussions publiques': '/public',
              'Où se trouve… ?': '/where',

            };
            router.push(routes[action.title] as never);
          }}
        >
          <Text style={styles.icon}>{action.icon}</Text>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{action.title}</Text>
            <Text style={styles.cardDescription}>
              {action.description}
            </Text>
          </View>
          <Text style={[styles.arrow, { color: accentColor }]}>›</Text>
        </Pressable>
      ))}

      <Text style={styles.footer}>
        FriendZone · Connecte les personnes
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 22,
    paddingTop: 54,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 34,
  },
  brand: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '800',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bell: {
    fontSize: 21,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 16,
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },
  storiesSection: {
    marginTop: -12,
    marginBottom: 28,
  },
  storiesSectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 13,
  },
  storiesRow: {
    paddingRight: 12,
    gap: 15,
  },
  storyBubble: {
    width: 68,
    alignItems: 'center',
  },
  storyAvatarWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: COLORS.primary,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  storyOwnAvatar: {
    borderColor: '#64748B',
  },
  storyAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  storyInitials: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  storyAddBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAddText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  storyName: {
    color: COLORS.text,
    fontSize: 11,
    marginTop: 6,
    maxWidth: 68,
    textAlign: 'center',
  },
  welcome: {
    padding: 22,
    borderRadius: 22,
    backgroundColor: '#17162C',
    borderWidth: 1,
    borderColor: '#39305F',
    marginBottom: 30,
  },
  welcomeTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
  },
  welcomeText: {
    color: '#C5C1DD',
    fontSize: 14,
    lineHeight: 22,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
    marginBottom: 12,
  },
  cardPressed: {
    opacity: 0.75,
  },
  icon: {
    fontSize: 27,
    marginRight: 14,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 5,
  },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  arrow: {
    color: COLORS.primary,
    fontSize: 29,
    marginLeft: 8,
  },
  footer: {
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 20,
  },
});

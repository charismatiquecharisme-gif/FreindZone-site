import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../context/theme-context';

type Member = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_path: string | null;
  mutual_follows: number;
  avatarUrl?: string | null;
};

type FriendStatus = 'sent' | 'received' | 'accepted';

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentColor } = useAppTheme();

  const [members, setMembers] = useState<Member[]>([]);
  const [statuses, setStatuses] = useState<Record<string, FriendStatus>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error('Connecte-toi pour découvrir les membres.');

      const userId = auth.user.id;
      setCurrentUserId(userId);

      const { data, error } = await supabase.functions.invoke('discover-members', {
        body: { limit: 50 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const rows = (data?.members || []) as Member[];

      const [requestsResult, membersWithAvatars] = await Promise.all([
        supabase
          .from('friend_requests')
          .select('sender_id, receiver_id, status')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
        Promise.all(rows.map(async (member) => {
          if (!member.avatar_path) return { ...member, avatarUrl: null };
          const { data: signed } = await supabase.storage
            .from('avatars')
            .createSignedUrl(member.avatar_path, 3600);
          return { ...member, avatarUrl: signed?.signedUrl || null };
        })),
      ]);

      if (requestsResult.error) throw requestsResult.error;

      const nextStatuses: Record<string, FriendStatus> = {};
      (requestsResult.data || []).forEach((request) => {
        const otherId = request.sender_id === userId
          ? request.receiver_id
          : request.sender_id;
        if (!rows.some((member) => member.id === otherId)) return;

        if (request.status === 'accepted') {
          nextStatuses[otherId] = 'accepted';
        } else if (request.status === 'pending' && !nextStatuses[otherId]) {
          nextStatuses[otherId] = request.sender_id === userId ? 'sent' : 'received';
        }
      });

      setStatuses(nextStatuses);
      setMembers(membersWithAvatars);
    } catch (error: any) {
      console.log('Erreur découverte des membres :', error);
      Alert.alert('Découverte', error?.message || 'Impossible de charger les suggestions.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      await loadMembers();
      if (active) setLoading(false);
    };
    run();
    return () => { active = false; };
  }, [loadMembers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMembers();
    setRefreshing(false);
  };

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) =>
      `${member.full_name || ''} ${member.username || ''}`.toLowerCase().includes(term)
    );
  }, [members, search]);

  async function friendAction(member: Member) {
    if (!currentUserId || actionId) return;
    const status = statuses[member.id];
    if (status === 'accepted' || status === 'sent') return;

    setActionId(member.id);
    try {
      if (status === 'received') {
        const { error } = await supabase.from('friend_requests')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('sender_id', member.id)
          .eq('receiver_id', currentUserId)
          .eq('status', 'pending');
        if (error) throw error;
        setStatuses((old) => ({ ...old, [member.id]: 'accepted' }));
        Alert.alert('Amis', 'Demande acceptée !');
      } else {
        const { error: deleteError } = await supabase.from('friend_requests')
          .delete()
          .eq('sender_id', currentUserId)
          .eq('receiver_id', member.id)
          .eq('status', 'declined');
        if (deleteError) throw deleteError;

        const { error } = await supabase.from('friend_requests').insert({
          sender_id: currentUserId,
          receiver_id: member.id,
          status: 'pending',
        });
        if (error) throw error;
        setStatuses((old) => ({ ...old, [member.id]: 'sent' }));
        Alert.alert('Demande envoyée', 'Ta demande d’amitié a été envoyée.');
      }
    } catch (error: any) {
      console.log('Erreur demande découverte :', error);
      Alert.alert('Erreur', error?.message || 'Action impossible.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Découvrir</Text>
          <Text style={styles.subtitle}>Rencontre de nouveaux membres</Text>
        </View>
        <Pressable onPress={onRefresh} style={styles.refreshButton}>
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Rechercher un nom ou pseudo..."
        placeholderTextColor="#85899B"
        style={styles.search}
        autoCapitalize="none"
      />

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      >
        <Text style={styles.sectionTitle}>Suggestions pour toi</Text>

        {loading ? (
          <ActivityIndicator color={accentColor} size="large" style={{ marginTop: 40 }} />
        ) : visibleMembers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>
              {search ? 'Aucun résultat' : 'Pas encore de suggestions'}
            </Text>
            <Text style={styles.emptyText}>
              {search ? 'Essaie un autre nom ou pseudo.' : 'De nouveaux membres apparaîtront ici.'}
            </Text>
          </View>
        ) : (
          visibleMembers.map((member) => {
            const name = member.full_name || member.username || 'Membre FriendZone';
            const initials = name.split(/\s+/).filter(Boolean)
              .slice(0, 2).map((part) => part[0]).join('').toUpperCase();
            const status = statuses[member.id];

            return (
              <View key={member.id} style={styles.card}>
                <Pressable
                  onPress={() => router.push({
                    pathname: '/user-profile',
                    params: { userId: member.id },
                  } as never)}
                  style={styles.identity}
                >
                  {member.avatarUrl ? (
                    <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: accentColor }]}>
                      <Text style={styles.initials}>{initials || 'M'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                    <Text style={styles.username} numberOfLines={1}>
                      {member.username ? `@${member.username}` : 'Membre FriendZone'}
                    </Text>
                    {member.mutual_follows > 0 && (
                      <Text style={styles.mutual}>
                        {member.mutual_follows} relation{member.mutual_follows > 1 ? 's' : ''} en commun
                      </Text>
                    )}
                  </View>
                  <Text style={styles.profileArrow}>›</Text>
                </Pressable>

                <Pressable
                  disabled={actionId === member.id || status === 'sent' || status === 'accepted'}
                  onPress={() => friendAction(member)}
                  style={[
                    styles.friendButton,
                    { backgroundColor: status === 'accepted' ? '#244B3A' : accentColor },
                    (actionId === member.id || status === 'sent' || status === 'accepted') && { opacity: 0.65 },
                  ]}
                >
                  <Text style={styles.friendButtonText}>
                    {actionId === member.id ? '...' :
                      status === 'accepted' ? 'Ami ✓' :
                      status === 'sent' ? 'Demande envoyée ✓' :
                      status === 'received' ? 'Accepter' : '+ Ajouter'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080B14' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18,
  },
  backButton: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: '#FFFFFF', fontSize: 30, lineHeight: 34 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  subtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 3 },
  refreshButton: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshText: { color: '#FFFFFF', fontSize: 26 },
  search: {
    marginHorizontal: 20, marginBottom: 18, paddingHorizontal: 16,
    height: 48, borderRadius: 15, color: '#FFFFFF',
    backgroundColor: '#111421', borderWidth: 1, borderColor: '#292D40',
  },
  list: { paddingHorizontal: 20, gap: 12 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 2 },
  card: {
    backgroundColor: '#111421', borderWidth: 1, borderColor: '#292D40',
    borderRadius: 18, padding: 13, gap: 12,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 17 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  name: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  username: { color: '#9CA3AF', fontSize: 11, marginTop: 3 },
  mutual: { color: '#A78BFA', fontSize: 10, marginTop: 4 },
  profileArrow: { color: '#9CA3AF', fontSize: 24, paddingHorizontal: 5 },
  friendButton: { alignSelf: 'flex-end', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 11 },
  friendButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  empty: {
    alignItems: 'center', backgroundColor: '#111421',
    borderRadius: 18, padding: 28, marginTop: 10,
  },
  emptyIcon: { fontSize: 34, marginBottom: 12 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  emptyText: { color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginTop: 7 },
});

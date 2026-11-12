
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../context/theme-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const filters = ['Conversations', 'Membres', 'Mes amis', 'Demandes'];
type MemberItem = {
  id: string;
  full_name: string;
  username: string;
  avatar_path: string | null;
};

type ConversationItem = {
  id: string;
  otherUserId: string;
  name: string;
  username: string;
  avatarPath: string | null;
  lastMessage: string;
  lastMessageDate: string;
};
export default function PrivateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accentColor: accent } = useAppTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Conversations');
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const gradientColors = [accent, accent] as const;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
const [loadingConversations, setLoadingConversations] = useState(true);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [avatarInitials, setAvatarInitials] = useState('??');
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersOffset, setMembersOffset] = useState(0);
  const [hasMoreMembers, setHasMoreMembers] = useState(true);
  const [loadingMoreMembers, setLoadingMoreMembers] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [friendStatuses, setFriendStatuses] = useState<Record<string, 'sent' | 'received' | 'accepted'>>({});
  const [friendActionId, setFriendActionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAvatar() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const metadata = data.user?.user_metadata || {};
        const displayName = String(
          metadata.full_name ||
          [metadata.first_name, metadata.last_name].filter(Boolean).join(' ') ||
          metadata.username ||
          ''
        ).trim();

        const initials = displayName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part.charAt(0))
          .join('')
          .toUpperCase() || '??';

        if (active) setAvatarInitials(initials);

        const avatarPath = metadata.avatar_path;
        if (!avatarPath) return;

        const { data: signed, error: signedError } = await supabase.storage
          .from('avatars')
          .createSignedUrl(avatarPath, 3600);

        if (signedError) throw signedError;

        if (active && signed?.signedUrl) {
          setAvatarUrl(signed.signedUrl);
        }
      } catch (error) {
        console.log('Erreur chargement photo Messages privés :', error);
      }
    }

    loadAvatar();

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;

    async function loadConversations() {
      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        const user = authData.user;
        if (!user) return;

        if (active) setCurrentUserId(user.id);

        const { data: rows, error } = await supabase
          .from('private_conversations')
          .select('id, user1_id, user2_id, created_at')
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const results: ConversationItem[] = await Promise.all(
          (rows || []).map(async (conversation) => {
            const otherUserId =
              conversation.user1_id === user.id
                ? conversation.user2_id
                : conversation.user1_id;

            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, username, avatar_path')
              .eq('id', otherUserId)
              .maybeSingle();

            const { data: message } = await supabase
              .from('private_messages')
              .select('content, created_at')
              .eq('conversation_id', conversation.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            return {
              id: conversation.id,
              otherUserId,
              name: profile?.full_name || 'Membre FriendZone',
              username: profile?.username || '',
              avatarPath: profile?.avatar_path || null,
              lastMessage: message?.content || 'Commencez à discuter',
              lastMessageDate: message?.created_at || conversation.created_at,
            };
          })
        );

        if (active) setConversations(results);
      } catch (error) {
        console.log('Erreur chargement conversations :', error);
      } finally {
        if (active) setLoadingConversations(false);
      }
    }

    loadConversations();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadMembers() {
      setLoadingMembers(true);
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) return;

        const { data, error } = await supabase.functions.invoke(
          'discover-members',
          {
            body: {
              limit: 30,
              offset: 0,
              search: '',
            },
          }
        );

        if (error) throw error;

        if (active) {
          const results = data?.members || [];
          setMembers(results);
          setMembersOffset(results.length);
          setHasMoreMembers(results.length >= 30);
          setCurrentUserId(auth.user.id);
        }

        const { data: requests, error: requestsError } = await supabase
          .from('friend_requests')
          .select('sender_id, receiver_id, status')
          .or(`sender_id.eq.${auth.user.id},receiver_id.eq.${auth.user.id}`);

        if (requestsError) throw requestsError;

        const statuses: Record<string, 'sent' | 'received' | 'accepted'> = {};
        (requests || []).forEach((request) => {
          const otherId = request.sender_id === auth.user.id
            ? request.receiver_id
            : request.sender_id;

          if (request.status === 'accepted') {
            statuses[otherId] = 'accepted';
          } else if (request.status === 'pending' && statuses[otherId] !== 'accepted') {
            statuses[otherId] = request.sender_id === auth.user.id ? 'sent' : 'received';
          }
        });

        if (active) setFriendStatuses(statuses);
      } catch (error) {
        console.log('Erreur chargement membres :', error);
      } finally {
        if (active) setLoadingMembers(false);
      }
    }

    loadMembers();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (filter !== 'Membres') return;

    let active = true;

    const timer = setTimeout(async () => {
      setLoadingMembers(true);

      try {
        const { data, error } = await supabase.functions.invoke(
          'discover-members',
          {
            body: {
              limit: 30,
              offset: 0,
              search: search.trim(),
            },
          }
        );

        if (error) throw error;

        if (active) {
          const results = data?.members || [];
          setMembers(results);
          setMembersOffset(results.length);
          setHasMoreMembers(results.length >= 30);
        }
      } catch (error) {
        console.log('Erreur recherche membres :', error);
      } finally {
        if (active) setLoadingMembers(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, filter]);

  async function loadMoreMembers() {
    if (loadingMoreMembers || !hasMoreMembers) return;

    setLoadingMoreMembers(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        'discover-members',
        {
          body: {
            limit: 30,
            offset: membersOffset,
            search: search.trim(),
          },
        }
      );

      if (error) throw error;

      const results = data?.members || [];

      setMembers((previous) => {
        const existingIds = new Set(previous.map((member) => member.id));
        return [
          ...previous,
          ...results.filter((member: MemberItem) => !existingIds.has(member.id)),
        ];
      });

      setMembersOffset((previous) => previous + results.length);
      setHasMoreMembers(results.length >= 30);
    } catch (error) {
      console.log('Erreur chargement de membres supplémentaires :', error);
    } finally {
      setLoadingMoreMembers(false);
    }
  }

  const filteredConversations = conversations.filter((item) => {
    const term = search.trim().toLowerCase();
    return !term ||
      item.name.toLowerCase().includes(term) ||
      item.username.toLowerCase().includes(term) ||
      item.lastMessage.toLowerCase().includes(term);
  });

  const filteredMembers = members.filter((item) => {
    const term = search.trim().toLowerCase();
    return !term ||
      (item.full_name || '').toLowerCase().includes(term) ||
      (item.username || '').toLowerCase().includes(term);
  });

  const receivedRequestsCount = Object.values(friendStatuses)
    .filter((status) => status === 'received').length;

  const visibleMembers = filter === 'Mes amis'
    ? filteredMembers.filter((member) => friendStatuses[member.id] === 'accepted')
    : filter === 'Demandes'
      ? filteredMembers.filter((member) =>
          friendStatuses[member.id] === 'received' || friendStatuses[member.id] === 'sent')
      : filteredMembers;

  async function sendFriendRequest(member: MemberItem) {
    if (friendActionId) return;
    setFriendActionId(member.id);

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error('Connecte-toi pour ajouter un ami.');

      const currentUserId = auth.user.id;

      const { data: requests, error: requestsError } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id, status')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

      if (requestsError) throw requestsError;

      const relation = (requests || []).filter((request) =>
        (request.sender_id === currentUserId && request.receiver_id === member.id) ||
        (request.sender_id === member.id && request.receiver_id === currentUserId)
      );

      if (relation.some((request) => request.status === 'accepted')) {
        setFriendStatuses((previous) => ({ ...previous, [member.id]: 'accepted' }));
        alert('Vous êtes déjà amis.');
        return;
      }

      const pending = relation.find((request) => request.status === 'pending');

      if (pending) {
        const outgoing = pending.sender_id === currentUserId;
        setFriendStatuses((previous) => ({
          ...previous,
          [member.id]: outgoing ? 'sent' : 'received',
        }));
        alert(outgoing
          ? 'Demande déjà envoyée.'
          : 'Cette personne vous a déjà envoyé une demande.');
        return;
      }

      const { error: deleteError } = await supabase
        .from('friend_requests')
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

      setFriendStatuses((previous) => ({ ...previous, [member.id]: 'sent' }));
      alert('Demande d’amitié envoyée !');
    } catch (error: any) {
      console.log('Erreur demande ami :', error);
      alert(error?.message || 'Impossible d’envoyer la demande.');
    } finally {
      setFriendActionId(null);
    }
  }

  async function respondFriendRequest(member: MemberItem, accepted: boolean) {
    if (friendActionId || !currentUserId) return;
    setFriendActionId(member.id);

    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({
          status: accepted ? 'accepted' : 'declined',
          updated_at: new Date().toISOString(),
        })
        .eq('sender_id', member.id)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending');

      if (error) throw error;

      setFriendStatuses((previous) => {
        const next = { ...previous };
        if (accepted) next[member.id] = 'accepted';
        else delete next[member.id];
        return next;
      });

      alert(accepted ? 'Vous êtes maintenant amis !' : 'Demande refusée.');
    } catch (error: any) {
      console.log('Erreur réponse demande ami :', error);
      alert(error?.message || 'Impossible de traiter cette demande.');
    } finally {
      setFriendActionId(null);
    }
  }

  async function startConversation(member: MemberItem) {
    if (startingId) return;
    setStartingId(member.id);

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = auth.user;
      if (!user) throw new Error('Connecte-toi pour envoyer un message.');

      const condition =
        `and(user1_id.eq.${user.id},user2_id.eq.${member.id}),and(user1_id.eq.${member.id},user2_id.eq.${user.id})`;

      const { data: existing, error: searchError } = await supabase
        .from('private_conversations')
        .select('id')
        .or(condition)
        .limit(1)
        .maybeSingle();

      if (searchError) throw searchError;

      let conversationId = existing?.id;

      if (!conversationId) {
        const { data: created, error: createError } = await supabase
          .from('private_conversations')
          .insert({ user1_id: user.id, user2_id: member.id })
          .select('id')
          .single();

        if (createError) {
          if (createError.code === '23505') {
            const { data: retry, error: retryError } = await supabase
              .from('private_conversations')
              .select('id')
              .or(condition)
              .limit(1)
              .maybeSingle();

            if (retryError) throw retryError;
            conversationId = retry?.id;
          } else {
            throw createError;
          }
        } else {
          conversationId = created.id;
        }
      }

      if (!conversationId) {
        throw new Error('Impossible d’ouvrir cette conversation.');
      }

      router.push({
        pathname: '/private-chat',
        params: { conversationId }
      } as any);
    } catch (error: any) {
      console.log('Erreur ouverture conversation :', error);
      alert(error?.message || 'Impossible de démarrer la conversation.');
    } finally {
      setStartingId(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={styles.headerTitle}>
            <Text style={styles.eyebrow}>FRIENDZONE</Text>
            <Text style={styles.title}>Messages privés</Text>
          </View>

          <Pressable onPress={() => router.push('/profile')} style={[styles.profileButton, { backgroundColor: accent, borderColor: accent }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.profileButtonText, { color: '#FFFFFF' }]}>{avatarInitials}</Text>
            )}
          </Pressable>
        </View>


        <LinearGradient
          colors={['#252044', '#19182B', '#111322']}
          style={styles.hero}
        >
          <View style={styles.heroGlow} />
          <Text style={styles.heroEmoji}>💬</Text>
          <Text style={styles.heroTitle}>
            Les belles rencontres{'\n'}commencent ici.
          </Text>
          <Text style={styles.heroDescription}>
            Découvre des personnes, fais connaissance et crée de vrais liens.
          </Text>
          <Pressable onPress={() => router.push('/public')}>
            <LinearGradient
              colors={gradientColors}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                Découvrir la communauté  →
              </Text>
            </LinearGradient>
          </Pressable>
          <View style={styles.heroDots}>
            <View style={[styles.dot, { backgroundColor: accent }]} />
            <View style={styles.dotMuted} />
            <View style={styles.dotMuted} />
          </View>
        </LinearGradient>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Ta messagerie</Text>
            <Text style={styles.sectionSubtitle}>
              Tes conversations au même endroit
            </Text>
          </View>
         <View style={styles.countBadge}>
            <Text style={styles.countText}>{conversations.length}</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher une conversation ou un membre..."
            placeholderTextColor="#777B91"
            style={styles.searchInput}
            selectionColor={accent}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </Pressable>
          )}
        </View>

        <View
          onTouchStart={(event) => {
            const touch = event.nativeEvent.touches[0];
            if (touch) touchStart.current = { x: touch.pageX, y: touch.pageY };
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            const touch = event.nativeEvent.changedTouches[0];
            touchStart.current = null;
            if (!start || !touch) return;

            const dx = touch.pageX - start.x;
            const dy = touch.pageY - start.y;
            if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.3) return;

            const currentIndex = filters.indexOf(filterRef.current);
            const nextIndex = dx < 0
              ? Math.min(filters.length - 1, currentIndex + 1)
              : Math.max(0, currentIndex - 1);

            if (nextIndex !== currentIndex) {
              const nextFilter = filters[nextIndex];
              filterRef.current = nextFilter;
              setFilter(nextFilter);
            }
          }}
          onTouchCancel={() => { touchStart.current = null; }}
        >
        <View style={styles.filters}>
          {filters.map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)}>
              {filter === item ? (
                <LinearGradient colors={gradientColors} style={styles.filterActive}>
                  <Text style={styles.filterActiveText}>{item === 'Demandes' ? `Demandes (${receivedRequestsCount})` : item}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.filterInactive}>
                  <Text style={styles.filterText}>{item === 'Demandes' ? `Demandes (${receivedRequestsCount})` : item}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {filter === 'Conversations' ? (
          loadingConversations ? (
            <Text style={{ color: '#A5A9BD', textAlign: 'center', padding: 25 }}>
              Chargement des conversations...
            </Text>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.emptyCard}>
              <LinearGradient colors={['#252044', '#19182B']} style={styles.emptyIconCircle}>
                <Text style={styles.emptyIcon}>✉️</Text>
              </LinearGradient>
              <Text style={styles.emptyTitle}>
                {search ? 'Aucune conversation trouvée' : 'Pas encore de messages'}
              </Text>
              <Text style={styles.emptyDescription}>
                {search
                  ? 'Essaie un autre nom ou recherche un membre.'
                  : 'Découvre les membres de FreindZone et démarre ta première conversation.'}
              </Text>
              <Pressable onPress={() => setFilter('Membres')}>
                <View style={[styles.secondaryButton, { borderColor: accent }]}>
                  <Text style={[styles.secondaryButtonText, { color: accent }]}>
                    Découvrir les membres →
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {filteredConversations.map((item) => {
                const initials = item.name.split(/\s+/).filter(Boolean)
                  .slice(0, 2).map((part) => part[0]).join('').toUpperCase();

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push({
                      pathname: '/private-chat',
                      params: { conversationId: item.id }
                    } as any)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: '#111421', borderWidth: 1,
                      borderColor: '#292D40', borderRadius: 18,
                      padding: 14, gap: 12
                    }}
                  >
                    <View style={{
                      width: 48, height: 48, borderRadius: 17,
                      backgroundColor: accent, alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                        {initials || 'M'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                        {item.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#9296AC', fontSize: 12, marginTop: 5 }}>
                        {item.lastMessage}
                      </Text>
                    </View>
                    <Text style={{ color: '#777B91', fontSize: 10 }}>
                      {new Date(item.lastMessageDate).toLocaleDateString()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )
        ) : (
          <View style={{ gap: 10 }}>
            {loadingMembers ? (
              <Text style={{ color: '#A5A9BD', textAlign: 'center', padding: 25 }}>
                Chargement des membres...
              </Text>
            ) : visibleMembers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>{filter === 'Mes amis' ? 'Tu n’as pas encore d’amis' : filter === 'Demandes' ? 'Aucune demande pour le moment' : 'Aucun membre trouvé'}</Text>
                <Text style={styles.emptyDescription}>
                  {search ? 'Essaie une autre recherche.' : filter === 'Mes amis' ? 'Tes amis apparaîtront ici après acceptation.' : filter === 'Demandes' ? 'Les demandes reçues et envoyées apparaîtront ici.' : 'Les nouveaux membres apparaîtront ici.'}
                </Text>
              </View>
            ) : visibleMembers.map((member) => {
              const name = member.full_name || member.username || 'Membre FreindZone';
              const initials = name.split(/\s+/).filter(Boolean)
                .slice(0, 2).map((part) => part[0]).join('').toUpperCase();

              return (
                <View key={member.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#111421', borderWidth: 1,
                  borderColor: '#292D40', borderRadius: 18,
                  padding: 14, gap: 12
                }}>
                  <View style={{
                    width: 46, height: 46, borderRadius: 16,
                    backgroundColor: accent, alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
                      {initials || 'M'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                      {name}
                    </Text>
                    <Text style={{ color: '#9296AC', fontSize: 11, marginTop: 4 }}>
                      {member.username ? '@' + member.username : 'Membre FreindZone'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Pressable
                      disabled={friendActionId === member.id || friendStatuses[member.id] === 'sent' || friendStatuses[member.id] === 'accepted'}
                      onPress={() => friendStatuses[member.id] === 'received'
                        ? respondFriendRequest(member, true)
                        : sendFriendRequest(member)}
                      style={{
                        backgroundColor: friendStatuses[member.id] === 'accepted' ? '#244B3A' : '#292442',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        opacity: friendActionId === member.id ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 10 }}>
                        {friendActionId === member.id ? '...' :
                          friendStatuses[member.id] === 'accepted' ? 'Ami ✓' :
                          friendStatuses[member.id] === 'sent' ? 'Envoyée ✓' :
                          friendStatuses[member.id] === 'received' ? 'Accepter' : '+ Ajouter'}
                      </Text>
                    </Pressable>
                    {friendStatuses[member.id] === 'received' && (
                      <Pressable
                        disabled={friendActionId !== null}
                        onPress={() => respondFriendRequest(member, false)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                      >
                        <Text style={{ color: '#F08B9B', fontSize: 10, fontWeight: '700' }}>
                          Refuser
                        </Text>
                      </Pressable>
                    )}
                  {filter !== 'Demandes' && (
                    <Pressable
                      disabled={startingId !== null}
                      onPress={() => startConversation(member)}
                      style={{
                        backgroundColor: accent, borderRadius: 12,
                        paddingHorizontal: 13, paddingVertical: 10,
                        opacity: startingId === member.id ? 0.5 : 1
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11 }}>
                        {startingId === member.id ? '...' : 'Message'}
                      </Text>
                    </Pressable>
                  )}
                  </View>
                </View>
              );
            })}
            {filter === 'Membres' && hasMoreMembers && !loadingMembers && (
              <Pressable
                onPress={loadMoreMembers}
                disabled={loadingMoreMembers}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 15,
                  marginTop: 8,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: accent,
                  opacity: loadingMoreMembers ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                  {loadingMoreMembers ? 'Chargement...' : 'Charger plus de membres'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        </View>
        <View style={styles.tip}>
          <Text style={styles.tipIcon}>✨</Text>
          <Text style={styles.tipText}>
            Astuce : découvre la communauté et fais de nouvelles rencontres.
          </Text>
        </View>

        <Text style={styles.footer}>FRIENDZONE · FAIS DE VRAIES RENCONTRES</Text>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}



const styles = StyleSheet.create({
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#292044',
    borderWidth: 1,
    borderColor: '#8B72FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },
  profileButtonText: {
    color: '#C4B5FD',
    fontSize: 15,
    fontWeight: '900',
  },

proximityCard: {
    backgroundColor: '#111421',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#292D42',
    padding: 16,
    marginBottom: 28,
    overflow: 'hidden',
  },
  proximityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  proximityEyebrow: {
    color: '#9297B0',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 5,
  },
  proximityTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  privacyButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#24283A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyButtonText: {
    color: '#FFFFFF',
    fontSize: 23,
  },
  miniMap: {
    height: 190,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 17,
    borderWidth: 1,
    borderColor: '#343653',
  },
  mapRoadOne: {
    position: 'absolute',
    width: '130%',
    height: 18,
    backgroundColor: '#344461',
    top: 62,
    left: -20,
    transform: [{ rotate: '-18deg' }],
    borderWidth: 1,
    borderColor: '#506080',
  },
  mapRoadTwo: {
    position: 'absolute',
    width: '130%',
    height: 13,
    backgroundColor: '#283C54',
    top: 125,
    left: -25,
    transform: [{ rotate: '22deg' }],
  },
  mapRoadThree: {
    position: 'absolute',
    width: 15,
    height: '150%',
    backgroundColor: '#30435E',
    left: '33%',
    top: -20,
    transform: [{ rotate: '25deg' }],
  },
  mapRoadFour: {
    position: 'absolute',
    width: 12,
    height: '150%',
    backgroundColor: '#34405F',
    right: '22%',
    top: -20,
    transform: [{ rotate: '-20deg' }],
  },
  mapLabelOne: {
    position: 'absolute',
    top: 28,
    left: 18,
  },
  mapLabelTwo: {
    position: 'absolute',
    bottom: 18,
    right: 15,
  },
  mapStreet: {
    color: '#A9BCD7',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  mapPinMe: {
    position: 'absolute',
    left: '22%',
    top: '27%',
    alignItems: 'center',
  },
  mapPinOther: {
    position: 'absolute',
    right: '20%',
    top: '48%',
    alignItems: 'center',
  },
  mapPinHalo: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    opacity: 0.28,
    top: -7,
  },
  mapPinDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinEmoji: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  mapPinLabel: {
    color: '#FFFFFF',
    backgroundColor: '#101525',
    overflow: 'hidden',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 5,
  },
  mapDemoBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#101525',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#434963',
  },
  mapDemoText: {
    color: '#D6D9EA',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#292D40',
  },
  distanceIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#24203D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceEmoji: {
    fontSize: 18,
  },
  distanceInfo: {
    flex: 1,
  },
  distanceTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  distanceSubtitle: {
    color: '#9297AE',
    fontSize: 10,
    lineHeight: 15,
  },
  distanceValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#292D40',
  },
  activityIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#555B70',
    marginHorizontal: 15,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  activitySubtitle: {
    color: '#9297AE',
    fontSize: 10,
    lineHeight: 15,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#1B2B3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTrack: {
    width: 45,
    height: 26,
    borderRadius: 14,
    backgroundColor: '#373B50',
    padding: 3,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  privacyNote: {
    color: '#8E94AB',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 14,
  },

  screen: {
    flex: 1,
    backgroundColor: '#080A12',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#171A29',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#292D40',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 35,
  },
  headerTitle: {
    flex: 1,
  },
  eyebrow: {
    color: '#898DA5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  hero: {
    borderRadius: 27,
    padding: 23,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#303248',
    marginBottom: 30,
  },
  heroGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FFFFFF10',
    right: -45,
    top: -50,
  },
  heroEmoji: {
    fontSize: 34,
    marginBottom: 15,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 34,
    marginBottom: 12,
  },
  heroDescription: {
    color: '#D0D2E2',
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 22,
  },
  primaryButton: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderRadius: 15,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  heroDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: '#8B5CF6',
    width: 18,
    height: 5,
    borderRadius: 5,
  },
  dotMuted: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#FFFFFF45',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#8589A0',
    fontSize: 12,
    marginTop: 5,
  },
  countBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#1A1D2D',
    borderWidth: 1,
    borderColor: '#30344A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121524',
    borderWidth: 1,
    borderColor: '#272B3F',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 15,
    height: 52,
  },
  searchIcon: {
    color: '#9A9EB5',
    fontSize: 25,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
  },
  clearSearch: {
    color: '#FFFFFF',
    padding: 8,
  },
  filters: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 20,
  },
  filterActive: {
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 10,
  },
  filterActiveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  filterInactive: {
    backgroundColor: '#151827',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#292D40',
  },
  filterText: {
    color: '#A5A9BD',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#111421',
    borderWidth: 1,
    borderColor: '#282C40',
    borderRadius: 25,
    alignItems: 'center',
    paddingHorizontal: 23,
    paddingVertical: 30,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 31,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyDescription: {
    color: '#9296AC',
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 23,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151827',
    borderRadius: 15,
    padding: 14,
    marginTop: 18,
    gap: 10,
  },
  tipIcon: {
    fontSize: 18,
  },
  tipText: {
    color: '#A9ADC0',
    fontSize: 11,
    lineHeight: 17,
    flex: 1,
  },
  footer: {
    color: '#555A70',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 28,
  },
});

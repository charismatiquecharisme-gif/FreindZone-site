import { useEffect, useState, useRef, type ComponentRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../context/theme-context';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';

type Room = {
  id: string;
  title: string;
  category: string;
  description: string;
  members: number;
  icon: string;
  color: string;
};

type Message = {
  id: string;
  user_id: string;
  author: string;
  text: string;
  time: string;
  mine?: boolean;
};

const ROOMS: Room[] = [
  {
    id: 'general',
    title: 'Discussion générale',
    category: 'Populaire',
    description: 'Parle de tout et rencontre du monde.',
    members: 128,
    icon: '💬',
    color: '#7C5CFF',
  },
  {
    id: 'friendship',
    title: 'Amitié',
    category: 'Amitié',
    description: 'Fais de nouvelles connaissances.',
    members: 86,
    icon: '🤝',
    color: '#0EA5E9',
  },
  {
    id: 'music',
    title: 'Musique & culture',
    category: 'Loisirs',
    description: 'Partage tes sons et tes passions.',
    members: 64,
    icon: '🎵',
    color: '#EC4899',
  },
  {
    id: 'morocco',
    title: 'Communauté Maroc',
    category: 'Communauté',
    description: 'Échange avec la communauté au Maroc.',
    members: 93,
    icon: '🌍',
    color: '#10B981',
  },
  {
    id: 'games',
    title: 'Jeux vidéo',
    category: 'Loisirs',
    description: 'Parle de tes jeux préférés.',
    members: 47,
    icon: '🎮',
    color: '#F59E0B',
  },
];

const CATEGORIES = ['Tout', 'Populaire', 'Amitié', 'Loisirs', 'Communauté'];

export default function PublicScreen() {
  const router = useRouter();
  const { accentColor } = useAppTheme();
  const insets = useSafeAreaInsets();
  const messageScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const messageInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarInitials, setAvatarInitials] = useState('??');

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
        console.log('Erreur chargement photo de profil :', error);
      }
    }

    loadAvatar();
    return () => {
      active = false;
    };
  }, []);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tout');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] =
    useState<Record<string, Message[]>>({});

  const filteredRooms = ROOMS.filter((room) => {
    const matchesSearch =
      room.title.toLowerCase().includes(search.toLowerCase()) ||
      room.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      category === 'Tout' || room.category === category;
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    if (!selectedRoom) return;

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function loadMessages() {
      const { data: { user }, error: userError } =
        await supabase.auth.getUser();

      if (userError || !user || !active) return;

      const metadata = user.user_metadata || {};
      const myName = [
        metadata.first_name,
        metadata.last_name,
      ].filter(Boolean).join(' ') || 'Moi';

      channel = supabase
        .channel(`public-room-${selectedRoom!.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'public_messages',
            filter: `room_id=eq.${selectedRoom!.id}`,
          },
          (payload) => {
            if (!active) return;

            const item = payload.new as {
              id: string;
              user_id: string;
              content: string;
              created_at: string;
            };

            const mine = item.user_id === user.id;

            setMessages((current) => {
              const existing = current[selectedRoom!.id] || [];
              if (existing.some((message) => message.id === item.id)) {
                return current;
              }

              const incoming = {
                id: item.id,
                user_id: item.user_id,
                author: mine ? myName : 'Membre',
                text: item.content,
                time: new Date(item.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                mine,
                created_at: item.created_at,
              };

              return {
                ...current,
                [selectedRoom!.id]: [...existing, incoming].sort(
                  (a, b) => {
                    const dateA: string = String((a as any).created_at || '');
                    const dateB: string = String((b as any).created_at || '');
                    return new Date(dateA).getTime() - new Date(dateB).getTime();
                  }
                ),
              };
            });
          }
        )
        .subscribe(async (status) => {
          if (!active) return;

          if (status === 'SUBSCRIBED') {
            const { data, error } = await supabase
              .from('public_messages')
              .select('id, user_id, content, created_at')
              .eq('room_id', selectedRoom!.id)
              .order('created_at', { ascending: true });

            if (!active) return;

            if (error) {
              console.error('Erreur chargement messages :', error);
              return;
            }

            const history = (data || []).map((item) => ({
              id: item.id,
              user_id: item.user_id,
              author: item.user_id === user.id ? myName : 'Membre',
              text: item.content,
              time: new Date(item.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              mine: item.user_id === user.id,
              created_at: item.created_at,
            }));

            setMessages((current) => {
              const merged = new Map<string, (typeof history)[number]>();
              [...history, ...(current[selectedRoom!.id] || [])].forEach((message) => {
                merged.set(message.id, message as (typeof history)[number]);
              });

              return {
                ...current,
                [selectedRoom!.id]: Array.from(merged.values()).sort(
                  (a, b) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                ),
              };
            });
          } else if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            console.error('Connexion Realtime publique :', status);
          }
        });
    }

    loadMessages();

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [selectedRoom]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !selectedRoom) return;

    try {
      const { data: { user }, error: userError } =
        await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Utilisateur non connecté.');
        return;
      }

      const { data, error } = await supabase
        .from('public_messages')
        .insert({
          room_id: selectedRoom.id,
          user_id: user.id,
          content: text,
        })
        .select()
        .single();

      if (error) throw error;

      const metadata = user.user_metadata || {};
      const author = [
        metadata.first_name,
        metadata.last_name,
      ].filter(Boolean).join(' ') || 'Membre';

      const newMessage: Message = {
        id: data.id,
        user_id: user.id,
        author,
        text: data.content,
        time: new Date(data.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        mine: true,
      };

      setMessages((current) => {
        const existing = current[selectedRoom.id] || [];
        if (existing.some((message) => message.id === newMessage.id)) {
          return current;
        }
        return {
          ...current,
          [selectedRoom.id]: [...existing, newMessage],
        };
      });

      setDraft('');
      messageInputRef.current?.focus();
    } catch (error) {
      console.error('Erreur envoi message :', error);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        {selectedRoom ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSelectedRoom(null);
              setDraft('');
            }}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        )}

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>FRIENDZONE</Text>
          <Text style={styles.headerTitle}>
            {selectedRoom ? selectedRoom.title : 'Discussion publique'}
          </Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>EN LIGNE</Text>
        </View>
        <Pressable onPress={() => router.push('/profile')} style={[styles.profileButton, { backgroundColor: accentColor, borderColor: accentColor }]}>

          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.profileButtonText, { color: '#FFFFFF' }]}>{avatarInitials}</Text>
          )}

        </Pressable>
      </View>

      {selectedRoom ? (
        <>
          <View style={styles.roomInfo}>
            <View
              style={[
                styles.roomIcon,
                { backgroundColor: `${selectedRoom.color}25` },
              ]}
            >
              <Text style={styles.roomEmoji}>{selectedRoom.icon}</Text>
            </View>
            <View style={styles.roomInfoText}>
              <Text style={styles.roomDescription}>
                {selectedRoom.description}
              </Text>
              <Text style={styles.memberText}>
                {selectedRoom.members} membres dans ce salon
              </Text>
            </View>
          </View>

          <ScrollView
            ref={messageScrollRef}
            style={styles.messageList}
            contentContainerStyle={[styles.messageContent, { paddingBottom: 16 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              messageScrollRef.current?.scrollToEnd({ animated: true })
            }
          >
            <Text style={styles.notice}>
              Bienvenue dans {selectedRoom.title} ! Respecte les autres
              membres et reste courtois.
            </Text>

            {(messages[selectedRoom.id] || []).map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  message.mine && styles.myMessageRow,
                ]}
              >
                {!message.mine && (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/user-profile',
                        params: { userId: message.user_id },
                      })
                    }
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>
                      {message.author.slice(0, 1).toUpperCase()}
                    </Text>
                  </Pressable>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    message.mine && styles.myMessageBubble,
                  ]}
                >
                  {!message.mine && (
                    <Text style={styles.messageAuthor}>
                      {message.author}
                    </Text>
                  )}
                  <Text style={styles.messageText}>{message.text}</Text>
                  <Text style={styles.messageTime}>{message.time}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.composer, { paddingBottom: 12 + insets.bottom }]}>
            <TextInput
              ref={messageInputRef}
              value={draft}
              onChangeText={setDraft}
              blurOnSubmit={false}
              placeholder="Écris un message..."
              placeholderTextColor="#858BA3"
              style={styles.input}
              multiline
              maxLength={1000}
              returnKeyType="default"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Envoyer le message"
              onPress={sendMessage}
              disabled={!draft.trim()}
              style={[
                styles.sendButton,
                !draft.trim() && styles.sendButtonDisabled,
              ]}
            >
              <Text style={styles.sendText}>➤</Text>
            </Pressable>
          </View>
          <Text style={styles.demoNote}>
            Tes messages sont partagés avec les membres connectés à ce salon.
          </Text>
        </>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>🌍</Text>
            <Text style={styles.heroTitle}>
              Des conversations,{'\n'}de nouvelles rencontres.
            </Text>
            <Text style={styles.heroDescription}>
              Rejoins un salon et discute avec la communauté.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>05</Text>
              <Text style={styles.statLabel}>Salons proposés</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>+400</Text>
              <Text style={styles.statLabel}>Membres exemples</Text>
            </View>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="🔎  Rechercher un salon..."
            placeholderTextColor="#858BA3"
            style={styles.searchInput}
            autoCapitalize="none"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryContent}
          >
            {CATEGORIES.map((item) => (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                style={[
                  styles.categoryChip,
                  category === item && styles.categoryChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === item && styles.categoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Découvrir les salons</Text>
            <Text style={styles.sectionCount}>
              {filteredRooms.length} salon(s)
            </Text>
          </View>

          {filteredRooms.map((room) => (
            <Pressable
              key={room.id}
              accessibilityRole="button"
              onPress={() => setSelectedRoom(room)}
              style={({ pressed }) => [
                styles.roomCard,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.roomIcon,
                  { backgroundColor: `${room.color}25` },
                ]}
              >
                <Text style={styles.roomEmoji}>{room.icon}</Text>
              </View>
              <View style={styles.roomDetails}>
                <View style={styles.roomTitleRow}>
                  <Text style={styles.roomTitle}>{room.title}</Text>
                  <View
                    style={[
                      styles.categoryDot,
                      { backgroundColor: room.color },
                    ]}
                  />
                </View>
                <Text style={styles.roomDescription} numberOfLines={2}>
                  {room.description}
                </Text>
                <Text style={styles.memberText}>
                  ● {room.members} membres · {room.category}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}

          {filteredRooms.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔎</Text>
              <Text style={styles.emptyTitle}>Aucun salon trouvé</Text>
              <Text style={styles.emptyText}>
                Essaie un autre mot ou une autre catégorie.
              </Text>
            </View>
          )}

          <Text style={styles.footerNote}>
            Les messages sont partagés en direct entre les membres connectés.
          </Text>
        </ScrollView>
      )}
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
  avatarImage: { width: 42, height: 42, borderRadius: 14 },
  profileButtonText: {
    color: '#C4B5FD',
    fontSize: 15,
    fontWeight: '900',
  },

  screen: {
    flex: 1,
    backgroundColor: '#080B14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 30 : 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#202437',
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#171B2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 36,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: '#9A86FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#102B26',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  liveText: {
    color: '#6EE7B7',
    fontSize: 9,
    fontWeight: '800',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 18,
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: '#14152A',
    borderColor: '#30274E',
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
  },
  heroEmoji: {
    fontSize: 34,
    marginBottom: 12,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '900',
    marginBottom: 10,
  },
  heroDescription: {
    color: '#B5B9CF',
    fontSize: 14,
    lineHeight: 21,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#121727',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242B40',
    padding: 14,
  },
  statNumber: {
    color: '#A99AFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 5,
  },
  statLabel: {
    color: '#A3A9C0',
    fontSize: 11,
  },
  searchInput: {
    backgroundColor: '#141A2A',
    borderColor: '#292F46',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 13,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 14,
  },
  categoryScroll: {
    flexGrow: 0,
    marginBottom: 22,
  },
  categoryContent: {
    gap: 8,
    paddingRight: 10,
  },
  categoryChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#171C2D',
    borderWidth: 1,
    borderColor: '#2A3045',
  },
  categoryChipActive: {
    backgroundColor: '#6D4AFF',
    borderColor: '#8C76FF',
  },
  categoryText: {
    color: '#B4BAD0',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionCount: {
    color: '#959BB4',
    fontSize: 11,
  },
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111727',
    borderWidth: 1,
    borderColor: '#252C41',
    borderRadius: 18,
    padding: 13,
    marginBottom: 11,
    gap: 12,
  },
  pressed: {
    opacity: 0.75,
  },
  roomIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomEmoji: {
    fontSize: 25,
  },
  roomDetails: {
    flex: 1,
    gap: 5,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  roomTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  categoryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  roomDescription: {
    color: '#A4AAC0',
    fontSize: 12,
    lineHeight: 17,
  },
  memberText: {
    color: '#7F89A6',
    fontSize: 10,
  },
  chevron: {
    color: '#9D8BFF',
    fontSize: 29,
    paddingHorizontal: 3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 38,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 6,
  },
  emptyText: {
    color: '#A4AAC0',
    fontSize: 13,
    textAlign: 'center',
  },
  footerNote: {
    color: '#707991',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 18,
  },
  roomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#202437',
  },
  roomInfoText: {
    flex: 1,
    gap: 6,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: 16,
    gap: 14,
  },
  notice: {
    alignSelf: 'center',
    maxWidth: '95%',
    color: '#A7A1D8',
    backgroundColor: '#17152B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '92%',
    alignSelf: 'flex-start',
  },
  myMessageRow: {
    alignSelf: 'flex-end',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#303653',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  messageBubble: {
    backgroundColor: '#171D30',
    borderColor: '#2B3249',
    borderWidth: 1,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexShrink: 1,
  },
  myMessageBubble: {
    backgroundColor: '#5C43D6',
    borderColor: '#7560E8',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  messageAuthor: {
    color: '#B5A6FF',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  messageTime: {
    color: '#B0B4CB',
    fontSize: 9,
    textAlign: 'right',
    marginTop: 5,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#202437',
    backgroundColor: '#0C101D',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 45,
    color: '#FFFFFF',
    backgroundColor: '#171D30',
    borderColor: '#303650',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: '#7657FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  demoNote: {
    color: '#747D98',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: '#0C101D',
  },
});

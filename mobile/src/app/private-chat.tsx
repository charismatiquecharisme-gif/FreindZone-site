import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, Pressable, TextInput, ScrollView,
  StyleSheet, StatusBar, Image, KeyboardAvoidingView,
  Platform, ActivityIndicator, PanResponder, Alert,
} from 'react-native';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { supabase } from '../lib/supabase';

type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  message_type?: string | null;
  audio_path?: string | null;
  audio_duration_seconds?: number | null;
};

export default function PrivateChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const scrollRef = useRef<any>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);

  const [userId, setUserId] = useState('');
  const [otherId, setOtherId] = useState('');
  const [name, setName] = useState('Discussion');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [recording, setRecording] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  const recordingStartedAt = useRef(0);
  const startingRecording = useRef(false);
  const pendingRecordingFinish = useRef<boolean | null>(null);
  const cancelRecording = useRef(false);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (playerStatus.didJustFinish) {
      setPlayingMessageId(null);
    }
  }, [playerStatus.didJustFinish]);

  useEffect(() => {
    let active = true;
    let messageChannel: any = null;
    let presenceChannel: any = null;

    async function init() {
      if (!conversationId) {
        setLoading(false);
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user || !active) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const { data: conversation, error } = await supabase
        .from('private_conversations')
        .select('id,user1_id,user2_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (error || !conversation ||
        (conversation.user1_id !== user.id && conversation.user2_id !== user.id)) {
        if (active) setLoading(false);
        return;
      }

      const other = conversation.user1_id === user.id
        ? conversation.user2_id : conversation.user1_id;
      setOtherId(other);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name,username,avatar_path')
        .eq('id', other)
        .maybeSingle();

      if (active && profile) {
        setName(profile.full_name || profile.username || 'Membre');
        if (profile.avatar_path) {
          const { data } = await supabase.storage
            .from('avatars')
            .createSignedUrl(profile.avatar_path, 3600);
          if (active && data?.signedUrl) setAvatar(data.signedUrl);
        }
      }

      const { data: history, error: historyError } = await supabase
        .from('private_messages')
        .select('id,sender_id,content,created_at,message_type,audio_path,audio_duration_seconds')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (!historyError) {
        setMessages(current => {
          const merged = new Map<string, ChatMessage>();
          [...(history || []), ...current].forEach(message => {
            merged.set(message.id, message as ChatMessage);
          });
          return Array.from(merged.values()).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      } else {
        console.error('Erreur chargement messages privés :', historyError);
      }
      setLoading(false);

      messageChannel = supabase
        .channel(`private-messages-${conversationId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`,
        }, (payload) => {
          const incoming = payload.new as ChatMessage;
          if (active) {
            setMessages(previous => {
              if (previous.some(m => m.id === incoming.id)) return previous;
              return [...previous, incoming].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });
          }

        })
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'private_messages',
        }, (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setMessages(previous => previous.filter(message => message.id !== deletedId));
          }
        })
        .subscribe(async (status) => {
          if (!active) return;

          if (status === 'SUBSCRIBED') {
            setLoading(false);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('Connexion Realtime privée :', status);
            setLoading(false);
          }
        });

      presenceChannel = supabase.channel(
        `private-typing-${conversationId}`,
        { config: { presence: { key: user.id } } }
      );

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          const typing = Object.entries(state).some(([key, values]: [string, any]) =>
            key !== user.id &&
            values.some((item: any) =>
              item.user_id === other && item.typing === true
            )
          );
          if (active) setOtherTyping(typing);
        })
        .subscribe();

      channelRef.current = presenceChannel;
    }

    init();

    return () => {
      active = false;

      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (recordingTimer.current) {
        clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
      }

      if (startingRecording.current) {
        pendingRecordingFinish.current = true;
      } else if (recordingStartedAt.current) {
        recordingStartedAt.current = 0;
        recorder.stop().catch(() => {});
        setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
        }).catch(() => {});
      }

      player.pause();

      if (presenceChannel) {
        presenceChannel.untrack();
        supabase.removeChannel(presenceChannel);
      }
      if (messageChannel) supabase.removeChannel(messageChannel);
    };
  }, [conversationId]);

  async function updateTyping(value: string) {
    setDraft(value);
    const channel = channelRef.current;
    if (!channel || !userId) return;

    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (value.trim()) {
      await channel.track({ user_id: userId, typing: true });
      typingTimer.current = setTimeout(() => {
        channel.untrack();
      }, 2500);
    } else {
      await channel.untrack();
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) return;
    if (!userId || !conversationId) {
      alert('Session ou conversation introuvable. Reconnectez-vous.');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('private_messages')
        .insert({ conversation_id: conversationId, sender_id: userId, content })
        .select('id,sender_id,content,created_at,message_type,audio_path,audio_duration_seconds')
        .single();

      if (error) throw error;
      if (data) {
        setMessages(previous =>
          previous.some(m => m.id === data.id) ? previous : [...previous, data]
        );
        setDraft('');
        if (typingTimer.current) clearTimeout(typingTimer.current);
        await channelRef.current?.untrack();
      }
    } catch (error: any) {
      console.error('Erreur envoi message écrit :', error);
      alert(error?.message || 'Impossible d’envoyer le message.');
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    if (recording || uploadingAudio || startingRecording.current) return;
    startingRecording.current = true;
    pendingRecordingFinish.current = null;

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone', 'Autorisez l’accès au microphone pour enregistrer un vocal.');
        return;
      }
      if (pendingRecordingFinish.current !== null) return;

      setPreviewUri(null);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
      if (pendingRecordingFinish.current !== null) {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
        });
        return;
      }

      await recorder.prepareToRecordAsync();
      if (pendingRecordingFinish.current !== null) {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          interruptionMode: 'doNotMix',
        });
        return;
      }

      recorder.record();
      recordingStartedAt.current = Date.now();
      setRecording(true);

      if (pendingRecordingFinish.current !== null) {
        const cancelled = pendingRecordingFinish.current;
        pendingRecordingFinish.current = null;
        await finishRecording(cancelled);
        return;
      }

      recordingTimer.current = setTimeout(() => finishRecording(false), 120000);
    } catch (error: any) {
      setRecording(false);
      Alert.alert('Enregistrement impossible', error?.message || 'Réessayez.');
    } finally {
      startingRecording.current = false;
      if (!recordingStartedAt.current) pendingRecordingFinish.current = null;
    }
  }

  async function finishRecording(cancelled = false) {
    if (!recordingStartedAt.current) {
      if (startingRecording.current) pendingRecordingFinish.current = cancelled;
      return;
    }

    if (recordingTimer.current) {
      clearTimeout(recordingTimer.current);
      recordingTimer.current = null;
    }

    const duration = Math.min(120, Math.max(1,
      Math.round((Date.now() - recordingStartedAt.current) / 1000)
    ));
    recordingStartedAt.current = 0;

    try {
      await recorder.stop();
      const uri = recorder.uri;
      setRecording(false);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });

      if (cancelled) {
        setPreviewUri(null);
        setPreviewDuration(0);
        return;
      }
      if (uri) {
        setPreviewUri(uri);
        setPreviewDuration(duration);
      }
    } catch (error: any) {
      setRecording(false);
      Alert.alert('Erreur audio', error?.message || 'Impossible de terminer le vocal.');
    }
  }

  async function sendAudioMessage() {
    if (!previewUri || !userId || !conversationId || uploadingAudio) return;

    setUploadingAudio(true);
    try {
      const fileName = `${Date.now()}.m4a`;
      const path = `${conversationId}/${userId}/${fileName}`;
      const response = await fetch(previewUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('voice-messages')
        .upload(path, blob, { contentType: 'audio/mp4', upsert: false });

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('private_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: '',
          message_type: 'audio',
          audio_path: path,
          audio_duration_seconds: previewDuration,
        })
        .select('id,sender_id,content,created_at,message_type,audio_path,audio_duration_seconds')
        .single();

      if (error) {
        await supabase.storage.from('voice-messages').remove([path]);
        throw error;
      }

      if (data) {
        setMessages(previous =>
          previous.some(message => message.id === data.id)
            ? previous : [...previous, data as ChatMessage]
        );
      }

      setPreviewUri(null);
      setPreviewDuration(0);
    } catch (error: any) {
      Alert.alert('Envoi impossible', error?.message || 'Le vocal n’a pas pu être envoyé.');
    } finally {
      setUploadingAudio(false);
    }
  }

  async function toggleAudioPlayback(message: ChatMessage) {
    if (!message.audio_path) return;

    if (playingMessageId === message.id && playerStatus.playing) {
      player.pause();
      return;
    }

    try {
      if (playingMessageId === message.id) {
        player.play();
        return;
      }

      const { data, error } = await supabase.storage
        .from('voice-messages')
        .createSignedUrl(message.audio_path, 3600);

      if (error || !data?.signedUrl) throw error || new Error('Audio indisponible.');

      player.replace(data.signedUrl);
      setPlayingMessageId(message.id);
      player.play();
    } catch (error: any) {
      Alert.alert('Lecture impossible', error?.message || 'Impossible de lire ce vocal.');
    }
  }

  function deleteMessage(message: ChatMessage) {
    Alert.alert(
      'Supprimer définitivement ?',
      'Ce message sera supprimé pour vous et pour l’autre participant.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('private_messages')
              .delete()
              .eq('id', message.id);

            if (error) {
              Alert.alert('Suppression impossible', error.message);
              return;
            }

            if (playingMessageId === message.id) {
              player.pause();
              setPlayingMessageId(null);
            }

            setMessages(previous => previous.filter(item => item.id !== message.id));

            if (message.audio_path) {
              const { error: storageError } = await supabase.storage
                .from('voice-messages')
                .remove([message.audio_path]);

              if (storageError) {
                Alert.alert('Message supprimé', 'Le message est supprimé pour les deux participants, mais le fichier audio n’a pas pu être effacé.');
              }
            }
          },
        },
      ]
    );
  }

  const micPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        cancelRecording.current = false;
        void startRecording();
      },
      onPanResponderMove: (_event, gesture) => {
        if (Math.abs(gesture.dx) > 80) cancelRecording.current = true;
      },
      onPanResponderRelease: () => {
        void finishRecording(cancelRecording.current);
      },
      onPanResponderTerminate: () => {
        void finishRecording(true);
      },
    })
  ).current;

  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
  }

  function formatTime(date: string) {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            otherId && router.push({
              pathname: '/user-profile',
              params: { userId: otherId },
            })
          }
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{name}</Text>
          <Text style={styles.headerStatus}>Discussion privée</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#A78BFA" size="large" />
          <Text style={styles.loadingText}>Chargement des messages...</Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={[styles.messagesContent, { paddingBottom: 12 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>✦</Text>
                <Text style={styles.emptyTitle}>Votre conversation commence ici</Text>
                <Text style={styles.emptyText}>Envoyez votre premier message.</Text>
              </View>
            )}

            {messages.map(message => {
              const mine = message.sender_id === userId;
              return (
                <View
                  key={message.id}
                  style={[styles.messageRow, mine ? styles.myRow : styles.theirRow]}
                >
                  <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
                    {message.message_type === 'audio' ? (
                      <Pressable onPress={() => toggleAudioPlayback(message)} style={styles.audioControl}>
                        <Text style={styles.audioPlay}>{playingMessageId === message.id && playerStatus.playing ? 'Ⅱ' : '▶'}</Text>
                        <Text style={styles.audioLabel}>
                          Message vocal · {formatDuration(message.audio_duration_seconds || 0)}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.messageText}>{message.content}</Text>
                    )}
                    <Text style={styles.messageTime}>{formatTime(message.created_at)}</Text>
                    {mine && (
                      <Pressable onPress={() => deleteMessage(message)} style={styles.deleteMessage}>
                        <Text style={styles.deleteMessageText}>Supprimer</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {otherTyping && (
            <View style={styles.typing}>
              <Text style={styles.typingText}>{name} est en train d’écrire…</Text>
              <Text style={styles.dots}>•••</Text>
            </View>
          )}

          <View style={[styles.composer, { paddingBottom: 12 + insets.bottom }]}>
            {previewUri ? (
              <>
                <Text style={styles.previewLabel}>Vocal prêt · {formatDuration(previewDuration)}</Text>
                <Pressable onPress={() => { setPreviewUri(null); setPreviewDuration(0); }} style={styles.cancelPreview}>
                  <Text style={styles.sendText}>✕</Text>
                </Pressable>
                <Pressable onPress={sendAudioMessage} disabled={uploadingAudio} style={styles.sendButton}>
                  <Text style={styles.sendText}>{uploadingAudio ? '…' : '➤'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={updateTyping}
                  placeholder="Écrire un message..."
                  placeholderTextColor="#77788A"
                  multiline
                  blurOnSubmit={false}
                  maxLength={2000}
                />
                <Pressable
                  onPress={sendMessage}
                  disabled={!draft.trim() || sending}
                  style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
                >
                  <Text style={styles.sendText}>{sending ? '…' : '➤'}</Text>
                </Pressable>
                <View
                  {...micPanResponder.panHandlers}
                  pointerEvents={uploadingAudio ? 'none' : 'auto'}
                  style={[styles.micButton, recording && styles.micRecording]}
                >
                  <Text style={styles.sendText}>{recording ? '●' : '🎙'}</Text>
                </View>
              </>
            )}
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080A12' },
  header: {
    height: 76, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#202033',
  },
  back: { width: 38, justifyContent: 'center' },
  backText: { color: '#FFFFFF', fontSize: 36, lineHeight: 40 },
  avatar: { width: 43, height: 43, borderRadius: 22 },
  avatarFallback: {
    width: 43, height: 43, borderRadius: 22,
    backgroundColor: '#49318A', alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  headerInfo: { marginLeft: 12, transform: [{ translateY: 12 }] },
  headerName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerStatus: { color: '#9B9BAD', fontSize: 12, marginTop: 3 },
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 22, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#A4A4B5', marginTop: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { color: '#A78BFA', fontSize: 35, marginBottom: 12 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  emptyText: { color: '#9292A5', marginTop: 7 },
  messageRow: { width: '100%', marginBottom: 12, flexDirection: 'row' },
  myRow: { justifyContent: 'flex-end' },
  theirRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  myBubble: { backgroundColor: '#6841C6', borderBottomRightRadius: 5 },
  theirBubble: { backgroundColor: '#1B1B2B', borderBottomLeftRadius: 5 },
  messageText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  messageTime: { color: '#D0C5EE', fontSize: 10, textAlign: 'right', marginTop: 5 },
  typing: { paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  typingText: { color: '#A9A0C5', fontSize: 12 },
  dots: { color: '#A78BFA', fontSize: 17, marginLeft: 7, letterSpacing: 2 },
  audioControl: { flexDirection: 'row', alignItems: 'center', minWidth: 175, paddingVertical: 5 },
  audioPlay: { color: '#FFFFFF', fontSize: 20, marginRight: 12 },
  audioLabel: { color: '#FFFFFF', fontSize: 13 },
  deleteMessage: { alignSelf: 'flex-end', marginTop: 5 },
  deleteMessageText: { color: '#F4A0A0', fontSize: 10 },
  previewLabel: { flex: 1, color: '#FFFFFF', fontSize: 13, paddingVertical: 14 },
  cancelPreview: { width: 38, height: 42, borderRadius: 21, backgroundColor: '#343044', alignItems: 'center', justifyContent: 'center' },
  micButton: { width: 46, height: 46, borderRadius: 23, marginLeft: 9, backgroundColor: '#49318A', alignItems: 'center', justifyContent: 'center' },
  micRecording: { backgroundColor: '#B83250' },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    borderTopWidth: 1, borderTopColor: '#202033', backgroundColor: '#0D0D19',
  },
  input: {
    flex: 1, minHeight: 46, maxHeight: 110, color: '#FFFFFF',
    backgroundColor: '#1A1A29', borderRadius: 23, paddingHorizontal: 17,
    paddingTop: 13, paddingBottom: 12, fontSize: 15,
  },
  sendButton: {
    width: 46, height: 46, borderRadius: 23, marginLeft: 9,
    backgroundColor: '#8055E8', alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#FFFFFF', fontSize: 21, fontWeight: 'bold' },
});

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { VideoView, useVideoPlayer } from 'expo-video';
import { supabase } from '../lib/supabase';

type Story = {
  id: string;
  user_id: string;
  media_path: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  expires_at: string;
  mediaUrl: string;
  username: string;
};

function StoryVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="contain"
      nativeControls
    />
  );
}

export default function StoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestedUserId =
    typeof params.userId === 'string' ? params.userId : undefined;
  const insets = useSafeAreaInsets();

  const [stories, setStories] = useState<Story[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState<Story | null>(null);
  const [storyViewCount, setStoryViewCount] = useState(0);
  const [storyViewers, setStoryViewers] = useState<string[]>([]);

  const loadStories = useCallback(async () => {
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) return;

      setUserId(auth.user.id);

      let storiesQuery = supabase
        .from('stories')
        .select('id,user_id,media_path,media_type,caption,created_at,expires_at')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (requestedUserId) {
        storiesQuery = storiesQuery.eq('user_id', requestedUserId);
      }

      const { data, error } = await storiesQuery;

      if (error) throw error;

      const rows = data || [];
      const ids = [...new Set(rows.map((story) => story.user_id))];

      let profiles: {
        id: string;
        full_name: string | null;
        username: string | null;
      }[] = [];

      if (ids.length) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id,full_name,username')
          .in('id', ids);

        if (!profileError && profileData) profiles = profileData;
      }

      const formatted = await Promise.all(
        rows.map(async (story) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from('stories')
            .createSignedUrl(story.media_path, 3600);

          if (signedError || !signed?.signedUrl) return null;

          const profile = profiles.find((item) => item.id === story.user_id);

          return {
            ...story,
            mediaUrl: signed.signedUrl,
            username:
              profile?.username ||
              profile?.full_name ||
              'Membre FriendZone',
          } as Story;
        })
      );

      const visibleStories = formatted.filter(
        (item): item is Story => item !== null
      );
      setStories(visibleStories);

      if (requestedUserId) {
        setSelected(visibleStories[0] || null);
      }
    } catch (error) {
      console.log('Erreur chargement stories :', error);
      Alert.alert('Stories', 'Impossible de charger les stories.');
    } finally {
      setLoading(false);
    }
  }, [requestedUserId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  async function chooseMedia() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Autorisation nécessaire',
          'Autorise l’accès à ta galerie pour publier une story.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.85,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets.length > 0) {
        setCaption('');
        setDraft(result.assets[0]);
      }
    } catch (error) {
      console.log('Erreur sélection média :', error);
      Alert.alert('Erreur', 'Impossible d’ouvrir la galerie.');
    }
  }

  async function publishStory() {
    if (!draft || !userId || uploading) return;

    setUploading(true);

    try {
      const isVideo = draft.type === 'video';
      const mimeType = (draft.mimeType || '').toLowerCase();

      const extension = isVideo
        ? (mimeType === 'video/quicktime' ||
           draft.uri.toLowerCase().includes('.mov') ? 'mov' : 'mp4')
        : mimeType === 'image/png'
          ? 'png'
          : mimeType === 'image/webp'
            ? 'webp'
            : 'jpg';

      const contentType = isVideo
        ? extension === 'mov'
          ? 'video/quicktime'
          : 'video/mp4'
        : extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : 'image/jpeg';

      const path = `${userId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${extension}`;

      const file = new File(draft.uri);
      const bytes = await file.bytes();

      if (bytes.byteLength > 50 * 1024 * 1024) {
        throw new Error('Le fichier dépasse la limite de 50 Mo.');
      }

      const { error: uploadError } = await supabase.storage
        .from('stories')
        .upload(path, bytes, {
          contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: userId,
          media_path: path,
          media_type: isVideo ? 'video' : 'image',
          caption: caption.trim() || null,
        });

      if (insertError) {
        await supabase.storage.from('stories').remove([path]);
        throw insertError;
      }

      setDraft(null);
      setCaption('');
      await loadStories();
      Alert.alert('Story publiée', 'Ta story est maintenant visible pendant 24 heures.');
    } catch (error) {
      console.log('Erreur publication story :', error);
      Alert.alert(
        'Publication impossible',
        error instanceof Error ? error.message : 'Une erreur est survenue.'
      );
    } finally {
      setUploading(false);
    }
  }

  async function openStory(story: Story) {
    setSelected(story);
    setStoryViewers([]);
    setStoryViewCount(0);

    try {
      if (story.user_id !== userId) {
        const { error } = await supabase
          .from('story_views')
          .insert({
            story_id: story.id,
            viewer_id: userId,
          });

        // Une vue par membre et par story : ignorer les doublons.
        if (error && error.code !== '23505') throw error;
        return;
      }

      const { data: views, error } = await supabase
        .from('story_views')
        .select('viewer_id')
        .eq('story_id', story.id);

      if (error) throw error;

      const viewerIds = [...new Set((views || []).map((view) => view.viewer_id))];
      setStoryViewCount(viewerIds.length);

      if (!viewerIds.length) return;

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id,username,full_name')
        .in('id', viewerIds);

      if (profileError) throw profileError;

      setStoryViewers(
        viewerIds.map((id) => {
          const profile = profiles?.find((item) => item.id === id);
          return profile?.username || profile?.full_name || 'Membre FriendZone';
        })
      );
    } catch (error) {
      console.log('Erreur chargement des vues :', error);
    }
  }

  function navigateStory(direction: 'next' | 'previous') {
    if (!selected) return;

    const index = stories.findIndex((story) => story.id === selected.id);
    const nextIndex = direction === 'next' ? index - 1 : index + 1;

    if (nextIndex < 0 || nextIndex >= stories.length) {
      setSelected(null);
      return;
    }

    void openStory(stories[nextIndex]);
  }

  useEffect(() => {
    if (!selected || selected.user_id === userId) return;

    const delay = selected.media_type === 'video' ? 15000 : 5000;
    const timer = setTimeout(() => {
      navigateStory('next');
    }, delay);

    return () => clearTimeout(timer);
  }, [selected, stories, userId]);

  async function deleteStory(story: Story) {
    if (story.user_id !== userId) return;

    Alert.alert(
      'Supprimer la story ?',
      'Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error: storageError } = await supabase.storage
                .from('stories')
                .remove([story.media_path]);

              if (storageError) throw storageError;

              const { error } = await supabase
                .from('stories')
                .delete()
                .eq('id', story.id)
                .eq('user_id', userId);

              if (error) throw error;

              setSelected(null);
              await loadStories();
            } catch (error) {
              console.log('Erreur suppression story :', error);
              Alert.alert('Erreur', 'Impossible de supprimer cette story.');
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Stories</Text>
        <Pressable onPress={chooseMedia} style={styles.addButton}>
          <Text style={styles.addText}>+ Créer</Text>
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        Partage tes moments avec les membres FriendZone.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#7C5CFF" />
      ) : stories.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyTitle}>Aucune story pour le moment</Text>
          <Text style={styles.emptyText}>
            {requestedUserId ? 'Ce membre n’a pas de story active.' : 'Publie une photo ou une vidéo pour partager ton premier moment.'}
          </Text>
          <Pressable onPress={chooseMedia} style={styles.publishButton}>
            <Text style={styles.publishText}>Créer ma première story</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {stories.map((story) => (
            <Pressable
              key={story.id}
              style={styles.storyCard}
              onPress={() => openStory(story)}
            >
              {story.media_type === 'image' ? (
                <Image source={{ uri: story.mediaUrl }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.thumbnail, styles.videoThumbnail]}>
                  <Text style={styles.playIcon}>▶</Text>
                </View>
              )}

              <View style={styles.storyInfo}>
                <Text style={styles.username}>{story.username}</Text>
                <Text style={styles.caption} numberOfLines={2}>
                  {story.caption || (story.media_type === 'video' ? 'Vidéo' : 'Photo')}
                </Text>
                <Text style={styles.date}>
                  {new Date(story.created_at).toLocaleString()}
                </Text>
              </View>

              <Text style={styles.openArrow}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)}>
        <View style={[styles.modal, { paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setDraft(null)}>
              <Text style={styles.cancelText}>Annuler</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Nouvelle story</Text>
            <View style={{ width: 55 }} />
          </View>

          {draft && (
            draft.type === 'video' ? (
              <View style={styles.preview}>
                <StoryVideo uri={draft.uri} />
              </View>
            ) : (
              <Image source={{ uri: draft.uri }} style={styles.preview} />
            )
          )}

          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Ajouter une légende (facultatif)"
            placeholderTextColor="#9CA3AF"
            maxLength={300}
            multiline
            style={styles.captionInput}
          />

          <Pressable
            onPress={publishStory}
            disabled={uploading}
            style={[styles.publishButton, uploading && styles.disabled]}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.publishText}>Publier ma story</Text>
            )}
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={!!selected}
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.viewer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.viewerHeader}>
              <Text style={styles.viewerName}>{selected.username}</Text>
              <Pressable onPress={() => setSelected(null)}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {selected.media_type === 'video' ? (
              <StoryVideo uri={selected.mediaUrl} />
            ) : (
              <Image
                source={{ uri: selected.mediaUrl }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}

            <View style={styles.storyNavigation}>
              <Pressable
                onPress={() => navigateStory('previous')}
                style={styles.navigationButton}
              >
                <Text style={styles.navigationText}>‹ Précédente</Text>
              </Pressable>
              <Pressable
                onPress={() => navigateStory('next')}
                style={styles.navigationButton}
              >
                <Text style={styles.navigationText}>Suivante ›</Text>
              </Pressable>
            </View>

            {!!selected.caption && (
              <Text style={styles.viewerCaption}>{selected.caption}</Text>
            )}

            {selected.user_id === userId && (
              <View style={styles.storyViews}>
                <Text style={styles.storyViewsTitle}>
                  👁 {storyViewCount} vue{storyViewCount > 1 ? 's' : ''}
                </Text>
                {storyViewers.length > 0 ? (
                  storyViewers.map((name, index) => (
                    <Text key={`${name}-${index}`} style={styles.storyViewerName}>
                      {name}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.storyViewerName}>
                    Aucun membre n’a encore vu cette story.
                  </Text>
                )}
              </View>
            )}

            {selected.user_id === userId && (
              <Pressable
                onPress={() => deleteStory(selected)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteText}>Supprimer ma story</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080B14', paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#FFFFFF', fontSize: 32, lineHeight: 36 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  addButton: {
    backgroundColor: '#7C5CFF',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
  },
  addText: { color: '#FFFFFF', fontWeight: '800' },
  subtitle: { color: '#9CA3AF', fontSize: 13, marginBottom: 22 },
  empty: { alignItems: 'center', paddingHorizontal: 20, marginTop: 90 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: '#9CA3AF', textAlign: 'center', lineHeight: 21, marginTop: 9 },
  publishButton: {
    backgroundColor: '#7C5CFF',
    padding: 16,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 22,
  },
  publishText: { color: '#FFFFFF', fontWeight: '800' },
  list: { paddingBottom: 30 },
  storyViews: {
    width: '100%',
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: '#171B2A',
    borderRadius: 14,
  },
  storyViewsTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  storyViewerName: {
    color: '#C5C9D8',
    fontSize: 13,
    paddingVertical: 3,
  },
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderColor: '#263044',
    borderWidth: 1,
    borderRadius: 17,
    padding: 11,
    marginBottom: 12,
  },
  thumbnail: { width: 66, height: 78, borderRadius: 12, backgroundColor: '#24213D' },
  videoThumbnail: { alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#FFFFFF', fontSize: 25 },
  storyInfo: { flex: 1, marginLeft: 13 },
  username: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  caption: { color: '#C5C1DD', marginTop: 5 },
  date: { color: '#9CA3AF', fontSize: 10, marginTop: 7 },
  openArrow: { color: '#9CA3AF', fontSize: 28, marginHorizontal: 5 },
  modal: { flex: 1, backgroundColor: '#080B14', paddingHorizontal: 20 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  cancelText: { color: '#C5C1DD', fontSize: 14 },
  modalTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  preview: {
    width: '100%',
    height: 390,
    borderRadius: 18,
    backgroundColor: '#111827',
  },
  captionInput: {
    backgroundColor: '#111827',
    color: '#FFFFFF',
    borderRadius: 14,
    padding: 15,
    marginTop: 18,
    minHeight: 55,
    textAlignVertical: 'top',
  },
  disabled: { opacity: 0.6 },
  media: { width: '100%', height: 360, backgroundColor: '#000000' },
  viewer: { flexGrow: 1, backgroundColor: '#080B14', paddingHorizontal: 16 },
  storyNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  navigationButton: {
    flex: 1,
    backgroundColor: '#252B40',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  navigationText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  viewerName: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  closeText: { color: '#FFFFFF', fontSize: 23, padding: 5 },
  viewerImage: { width: '100%', height: 360 },
  viewerCaption: { color: '#FFFFFF', fontSize: 15, padding: 14, textAlign: 'center' },
  deleteButton: {
    backgroundColor: '#7F1D1D',
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginVertical: 12,
  },
  deleteText: { color: '#FFFFFF', fontWeight: '800' },
});

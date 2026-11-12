import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

type FriendStatus = 'sent' | 'received' | 'accepted' | null;

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Membre');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [interests, setInterests] = useState<any[]>([]);
  const [socialLanguages, setSocialLanguages] = useState<any[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [icebreakers, setIcebreakers] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        if (!userId) return;

        // Effacer les anciennes informations avant de charger un autre profil
        setBio('');
        setCountry('');
        setLanguage('');
        setAvatar('');
        setName('');
        setUsername('');
        setFriendStatus(null);

        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        const myId = auth.user?.id || null;
        if (active) setCurrentUserId(myId);

        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_path')
          .eq('id', userId)
          .maybeSingle();

        if (error) throw error;

        if (data && active) {
          setName(data.full_name || data.username || 'Membre');
          setUsername(data.username || '');
          const { data: details, error: detailsError } = await supabase
            .from('profile_private_details')
            .select('bio, country, language')
            .eq('user_id', userId)
            .maybeSingle();

          if (detailsError) {
            console.log('Informations privées non accessibles :', detailsError);
          } else if (active) {
            setBio(details?.bio || '');
            setCountry(details?.country || '');
            setLanguage(details?.language || '');
          }
        }


        // Charger les informations sociales autorisées par les règles RLS Supabase.
        if (data && active) {
          if (myId && myId !== userId) {
            const { error: visitError } = await supabase
              .from('profile_visits')
              .insert({ visitor_id: myId, profile_id: userId });
            if (visitError && !String(visitError.code).includes('23505')) {
              console.log('Visite du profil non enregistrée :', visitError.message);
            }
          }

          const [
            interestsResult,
            languagesResult,
            galleryResult,
            badgesResult,
            icebreakersResult,
          ] = await Promise.all([
            supabase.from('profile_interests').select('interest').eq('user_id', userId),
            supabase.from('profile_languages').select('language, proficiency').eq('user_id', userId),
            supabase.from('profile_gallery').select('storage_path, caption, position').eq('user_id', userId).order('position'),
            supabase.from('user_badges').select('badge_id, awarded_at, badges(name, description, icon)').eq('user_id', userId),
            supabase.from('profile_icebreakers').select('prompt, answer, position').eq('user_id', userId).order('position'),
          ]);

          if (active && !interestsResult.error) setInterests(interestsResult.data || []);
          if (active && !languagesResult.error) setSocialLanguages(languagesResult.data || []);
          if (active && !badgesResult.error) setBadges(badgesResult.data || []);
          if (active && !icebreakersResult.error) setIcebreakers(icebreakersResult.data || []);

          if (active && !galleryResult.error) {
            const photos = await Promise.all((galleryResult.data || []).map(async (photo: any) => {
              const { data: signed, error: signedError } = await supabase.storage
                .from('profile-gallery')
                .createSignedUrl(photo.storage_path, 3600);
              return { ...photo, signedUrl: signedError ? null : signed?.signedUrl || null };
            }));
            if (active) setGallery(photos);
          }
        }

        if (data?.avatar_path) {
          try {
            const { data: signed, error: signedError } =
              await supabase.storage
                .from('avatars')
                .createSignedUrl(data.avatar_path, 3600);

            if (signedError) throw signedError;

            if (active && signed?.signedUrl) {
              setAvatar(signed.signedUrl);
            }
          } catch (imageError) {
            console.log('Photo de profil indisponible :', imageError);
          }
        }

        if (myId && myId !== userId) {
          const { data: requests, error: requestsError } =
            await supabase
              .from('friend_requests')
              .select('sender_id, receiver_id, status')
              .or(
                `sender_id.eq.${myId},receiver_id.eq.${myId}`
              );

          if (requestsError) throw requestsError;

          let status: FriendStatus = null;

          (requests || []).forEach((request) => {
            const otherId = request.sender_id === myId
              ? request.receiver_id
              : request.sender_id;

            if (otherId !== userId) return;

            if (request.status === 'accepted') {
              status = 'accepted';
            } else if (
              request.status === 'pending' &&
              status !== 'accepted'
            ) {
              status = request.sender_id === myId
                ? 'sent'
                : 'received';
            }
          });

          if (active) setFriendStatus(status);
        }
      } catch (error) {
        console.log('Erreur chargement profil public :', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [userId]);

  async function sendFriendRequest() {
    if (!currentUserId || !userId || friendActionLoading) return;

    setFriendActionLoading(true);

    try {
      const { data: requests, error: requestsError } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id, status')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

      if (requestsError) throw requestsError;

      const relation = (requests || []).filter((request) =>
        (request.sender_id === currentUserId && request.receiver_id === userId) ||
        (request.sender_id === userId && request.receiver_id === currentUserId)
      );

      if (relation.some((request) => request.status === 'accepted')) {
        setFriendStatus('accepted');
        Alert.alert('FreindZone', 'Vous êtes déjà amis.');
        return;
      }

      const pending = relation.find((request) => request.status === 'pending');

      if (pending) {
        const outgoing = pending.sender_id === currentUserId;
        setFriendStatus(outgoing ? 'sent' : 'received');
        Alert.alert(
          'FreindZone',
          outgoing ? 'Demande déjà envoyée.' : 'Cette personne vous a déjà envoyé une demande.'
        );
        return;
      }

      const { error: deleteError } = await supabase
        .from('friend_requests')
        .delete()
        .eq('sender_id', currentUserId)
        .eq('receiver_id', userId)
        .eq('status', 'declined');

      if (deleteError) throw deleteError;

      const { error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: currentUserId,
          receiver_id: userId,
          status: 'pending',
        });

      if (error) throw error;

      setFriendStatus('sent');
      Alert.alert('FreindZone', 'Demande d’amitié envoyée !');
    } catch (error: any) {
      console.log('Erreur demande ami :', error);
      Alert.alert(
        'FreindZone',
        error?.message || 'Impossible d’envoyer la demande.'
      );
    } finally {
      setFriendActionLoading(false);
    }
  }

  async function respondFriendRequest(accepted: boolean) {
    if (!currentUserId || !userId || friendActionLoading) return;

    setFriendActionLoading(true);

    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({
          status: accepted ? 'accepted' : 'declined',
          updated_at: new Date().toISOString(),
        })
        .eq('sender_id', userId)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending');

      if (error) throw error;

      setFriendStatus(accepted ? 'accepted' : null);

      Alert.alert(
        'FreindZone',
        accepted ? 'Vous êtes maintenant amis !' : 'Demande refusée.'
      );
    } catch (error: any) {
      console.log('Erreur réponse demande ami :', error);
      Alert.alert(
        'FreindZone',
        error?.message || 'Impossible de traiter la demande.'
      );
    } finally {
      setFriendActionLoading(false);
    }
  }

  const isOwnProfile = currentUserId === userId;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Retour</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator size="large" color="#7C5CFF" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.initial}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={styles.name}>{name}</Text>

          {username ? (
            <Text style={styles.username}>@{username}</Text>
          ) : null}

          {bio ? <Text style={styles.bio}>{bio}</Text> : null}

          {(country || language) ? (
            <View style={styles.infoCard}>
              {country ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>🌍 Pays</Text>
                  <Text style={styles.infoValue}>{country}</Text>
                </View>
              ) : null}

              {language ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>🗣️ Langue</Text>
                  <Text style={styles.infoValue}>{language}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {interests.length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>💜 Centres d’intérêt</Text>
              <Text style={styles.infoValue}>
                {interests.map((item: any) => item.interest).join(' · ')}
              </Text>
            </View>
          ) : null}

          {socialLanguages.length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>🌐 Autres langues</Text>
              {socialLanguages.map((item: any, index: number) => (
                <Text key={`${item.language}-${index}`} style={styles.infoValue}>
                  {item.language} · {item.proficiency}
                </Text>
              ))}
            </View>
          ) : null}

          {icebreakers.length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>❄️ Pour faire connaissance</Text>
              {icebreakers.map((item: any, index: number) => (
                <View key={`${item.position}-${index}`} style={{ gap: 5 }}>
                  <Text style={styles.infoLabel}>{item.prompt}</Text>
                  <Text style={styles.infoValue}>{item.answer}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {badges.length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>🏅 Badges</Text>
              {badges.map((item: any, index: number) => {
                const badge = Array.isArray(item.badges) ? item.badges[0] : item.badges;
                if (!badge) return null;
                return (
                  <View key={`${item.badge_id}-${index}`} style={{ gap: 4 }}>
                    <Text style={styles.infoValue}>{badge.icon || '🏅'} {badge.name}</Text>
                    {!!badge.description ? (
                      <Text style={styles.infoLabel}>{badge.description}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {gallery.length > 0 ? (
            <View style={[styles.infoCard, { alignItems: 'flex-start' }]}>
              <Text style={styles.infoLabel}>📸 Galerie</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {gallery.map((photo: any) => photo.signedUrl ? (
                  <Image
                    key={photo.storage_path}
                    source={{ uri: photo.signedUrl }}
                    resizeMode="cover"
                    style={{ width: 92, height: 92, borderRadius: 12 }}
                  />
                ) : null)}
              </View>
            </View>
          ) : null}

          {!isOwnProfile && currentUserId ? (
            <View style={styles.friendActions}>
              {friendStatus === 'accepted' ? (
                <View style={styles.acceptedButton}>
                  <Text style={styles.buttonText}>✓ Vous êtes amis</Text>
                </View>
              ) : friendStatus === 'sent' ? (
                <View style={styles.pendingButton}>
                  <Text style={styles.buttonText}>Demande envoyée ✓</Text>
                </View>
              ) : friendStatus === 'received' ? (
                <>
                  <Pressable
                    disabled={friendActionLoading}
                    onPress={() => respondFriendRequest(true)}
                    style={styles.addButton}
                  >
                    <Text style={styles.buttonText}>
                      {friendActionLoading ? '...' : 'Accepter la demande'}
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={friendActionLoading}
                    onPress={() => respondFriendRequest(false)}
                    style={styles.refuseButton}
                  >
                    <Text style={styles.buttonText}>Refuser</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  disabled={friendActionLoading}
                  onPress={sendFriendRequest}
                  style={styles.addButton}
                >
                  <Text style={styles.buttonText}>
                    {friendActionLoading ? '...' : '+ Ajouter en ami'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080B14',
  },
  back: {
    padding: 18,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 17,
  },
  content: {
    alignItems: 'center',
    padding: 25,
  },
  avatar: {
    width: 125,
    height: 125,
    borderRadius: 65,
    marginBottom: 20,
  },
  avatarFallback: {
    width: 125,
    height: 125,
    borderRadius: 65,
    backgroundColor: '#7C5CFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  initial: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: 'bold',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  username: {
    color: '#A99AFF',
    fontSize: 16,
    marginTop: 8,
  },
  bio: {
    color: '#A0A0B0',
    marginTop: 20,
    fontSize: 15,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#1E1E36',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    gap: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: '#A0A0B0',
    fontSize: 14,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '55%',
    textAlign: 'right',
  },
  friendActions: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
    marginTop: 25,
  },
  addButton: {
    backgroundColor: '#6841C6',
    borderRadius: 13,
    paddingHorizontal: 24,
    paddingVertical: 13,
    minWidth: 210,
    alignItems: 'center',
  },
  acceptedButton: {
    backgroundColor: '#244B3A',
    borderRadius: 13,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  pendingButton: {
    backgroundColor: '#292442',
    borderRadius: 13,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  refuseButton: {
    backgroundColor: '#49303A',
    borderRadius: 13,
    paddingHorizontal: 24,
    paddingVertical: 11,
    minWidth: 150,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

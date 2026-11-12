import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAppTheme } from '../context/theme-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

const THEMES = [
  { name: 'Violet', color: '#7C5CFF' },
  { name: 'Bleu', color: '#3B82F6' },
  { name: 'Rose', color: '#EC4899' },
  { name: 'Vert', color: '#22C55E' },
  { name: 'Rouge', color: '#EF4444' },
  { name: 'Orange', color: '#F97316' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accentColor: theme, setAccentColor: setTheme } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('Français');
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers' | 'friends' | 'private'>('public');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingPhotoBase64, setPendingPhotoBase64] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [interests, setInterests] = useState('');
  const [socialLanguages, setSocialLanguages] = useState('');
  const [icebreakers, setIcebreakers] = useState('');
  const [gallery, setGallery] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [visitCount, setVisitCount] = useState(0);



  useEffect(() => {
    async function loadProfile() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const user = data.user;
        if (user) {
          const meta = user.user_metadata || {};
          setEmail(user.email || '');
          setName(meta.full_name || '');
          setPseudo(meta.username || '');
          const { data: details, error: detailsError } = await supabase
            .from('profile_private_details')
            .select('bio, country, language')
            .eq('user_id', user.id)
            .maybeSingle();

          if (detailsError) throw detailsError;

          setBio(details?.bio || meta.bio || '');
          setCountry(details?.country || meta.country || '');
          setLanguage(details?.language || meta.language || 'Français');

          const { data: privacy, error: privacyError } = await supabase
            .from('user_privacy_settings')
            .select('profile_visibility')
            .eq('user_id', user.id)
            .maybeSingle();

          if (privacyError) throw privacyError;

      const userId = data.user.id;

      const interestItems = [...new Set(interests.split(',').map((v) => v.trim()).filter(Boolean))];
      const languageItems = [...new Set(socialLanguages.split(',').map((v) => v.trim()).filter(Boolean))];
      const icebreakerItems = icebreakers.split('\n').map((line) => {
        const separator = line.indexOf('|');
        return separator > 0
          ? { prompt: line.slice(0, separator).trim(), answer: line.slice(separator + 1).trim() }
          : null;
      }).filter((item): item is { prompt: string; answer: string } => !!item && !!item.prompt && !!item.answer);

      for (const table of ['profile_interests', 'profile_languages', 'profile_icebreakers']) {
        const { error: deleteError } = await supabase.from(table).delete().eq('user_id', userId);
        if (deleteError) throw deleteError;
      }

      if (interestItems.length) {
        const { error: insertError } = await supabase.from('profile_interests')
          .insert(interestItems.map((interest) => ({ user_id: userId, interest })));
        if (insertError) throw insertError;
      }

      if (languageItems.length) {
        const { error: insertError } = await supabase.from('profile_languages')
          .insert(languageItems.map((language) => ({ user_id: userId, language, proficiency: 'conversational' })));
        if (insertError) throw insertError;
      }

      if (icebreakerItems.length) {
        const { error: insertError } = await supabase.from('profile_icebreakers')
          .insert(icebreakerItems.map((item, index) => ({ user_id: userId, ...item, position: index })));
        if (insertError) throw insertError;
      }

          setProfileVisibility(privacy?.profile_visibility || 'public');

          const [interestsResult, languagesResult, galleryResult, badgesResult, visitsResult, icebreakersResult] = await Promise.all([
            supabase.from('profile_interests').select('interest').eq('user_id', user.id),
            supabase.from('profile_languages').select('language, proficiency').eq('user_id', user.id),
            supabase.from('profile_gallery').select('storage_path, caption, position').eq('user_id', user.id).order('position'),
            supabase.from('user_badges').select('badge_id, awarded_at, badges(name, description, icon)').eq('user_id', user.id),
            supabase.from('profile_visits').select('visitor_id', { count: 'exact', head: true }).eq('profile_id', user.id),
            supabase.from('profile_icebreakers').select('prompt, answer, position').eq('user_id', user.id).order('position'),
          ]);

          if (!interestsResult.error) {
            setInterests((interestsResult.data || []).map((item: any) => item.interest).join(', '));
          }
          if (!languagesResult.error) {
            setSocialLanguages((languagesResult.data || []).map((item: any) => item.language).join(', '));
          }
          if (!galleryResult.error) {
            const galleryWithUrls = await Promise.all((galleryResult.data || []).map(async (item: any) => {
              const { data: signed } = await supabase.storage
                .from('profile-gallery')
                .createSignedUrl(item.storage_path, 3600);
              return { ...item, signedUrl: signed?.signedUrl || null };
            }));
            setGallery(galleryWithUrls);
          }
          if (!badgesResult.error) setBadges(badgesResult.data || []);
          if (!visitsResult.error) setVisitCount(visitsResult.count || 0);
          if (!icebreakersResult.error) {
            setIcebreakers((icebreakersResult.data || []).map((item: any) => `${item.prompt}|${item.answer}`).join('\n'));
          }


          if (meta.avatar_path) {
            setAvatarPath(meta.avatar_path);
            const { data: signed, error: signedError } =
              await supabase.storage
                .from('avatars')
                .createSignedUrl(meta.avatar_path, 3600);

            console.log('CHEMIN PHOTO :', meta.avatar_path);
            if (signedError) {
              console.log('ERREUR PHOTO SUPABASE :', signedError.message);
            } else if (signed?.signedUrl) {
              console.log('LIEN PHOTO CREE');
              setAvatarUrl(signed.signedUrl);
            } else {
              console.log('AUCUN LIEN PHOTO RETOURNE');
            }
          }
        }

      } catch (error) {
        console.log('Erreur de chargement du profil :', error);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  useEffect(() => {
    let active = true;

    async function checkAdminRole() {
      try {
        const { data, error } = await supabase.functions.invoke('admin-access');
        if (error) throw error;

        const role = data?.role;
        if (active && ['owner', 'admin', 'moderator'].includes(role)) {
          setAdminRole(role);
        }
      } catch (error) {
        console.log('Vérification du rôle administratif impossible :', error);
      }
    }

    checkAdminRole();
    return () => {
      active = false;
    };
  }, []);

  async function chooseAndUploadAvatar() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Autorisation nécessaire',
          'Autorise FriendZone à accéder à ta galerie pour choisir une photo.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploadingAvatar(true);

      const processed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800, height: 800 } }],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );

      console.log('PHOTO ORIGINALE :', result.assets[0].uri);
      console.log('PHOTO TRANSFORMEE :', processed.uri);
      console.log('DIMENSIONS :', processed.width, 'x', processed.height);

      console.log('BASE64 PHOTO :', processed.base64 ? 'PRESENT' : 'ABSENT');
      console.log('TAILLE BASE64 :', processed.base64?.length || 0);
      setPendingPhotoBase64(processed.base64 || null);
      setPendingPhotoUri(processed.uri);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de préparer cette photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function confirmAvatar() {
    if (!pendingPhotoBase64) {
      Alert.alert('Photo indisponible', 'Choisis à nouveau une photo.');
      return;
    }

    setUploadingAvatar(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error('Tu dois être connecté.');

      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const clean = pendingPhotoBase64!.replace(/[^A-Za-z0-9+/=]/g, '');
      const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
      const fileData = new Uint8Array(Math.floor(clean.length * 3 / 4) - padding);
      let byteIndex = 0;

      for (let i = 0; i < clean.length; i += 4) {
        const a = alphabet.indexOf(clean[i]);
        const b = alphabet.indexOf(clean[i + 1]);
        const c = clean[i + 2] === '=' ? 0 : alphabet.indexOf(clean[i + 2]);
        const d = clean[i + 3] === '=' ? 0 : alphabet.indexOf(clean[i + 3]);

        if (a < 0 || b < 0 || c < 0 || d < 0) {
          throw new Error('Données photo invalides.');
        }

        if (byteIndex < fileData.length) fileData[byteIndex++] = (a << 2) | (b >> 4);
        if (byteIndex < fileData.length) fileData[byteIndex++] = ((b & 15) << 4) | (c >> 2);
        if (byteIndex < fileData.length) fileData[byteIndex++] = ((c & 3) << 6) | d;
      }

      if (fileData.byteLength === 0) {
        throw new Error('La photo préparée est vide ou illisible.');
      }

      console.log('TAILLE PHOTO PREPAREE :', fileData.byteLength, 'octets');

      if (fileData.byteLength > 2 * 1024 * 1024) {
        throw new Error('La photo dépasse la limite de 2 Mo.');
      }

      const newPath = `${userData.user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(newPath, fileData, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: metadataError } = await supabase.auth.updateUser({
        data: { avatar_path: newPath },
      });

      if (metadataError) throw metadataError;

      const { data: signed, error: signedError } = await supabase.storage
        .from('avatars')
        .createSignedUrl(newPath, 3600);

      if (signedError) throw signedError;

      setAvatarPath(newPath);
      setAvatarUrl(signed.signedUrl);
      setPendingPhotoUri(null);
      setPendingPhotoBase64(null);

      Alert.alert('Photo mise à jour', 'Ta photo de profil a été enregistrée.');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d’envoyer cette photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (!avatarPath) return;

    Alert.alert('Supprimer la photo', 'Veux-tu vraiment supprimer ta photo ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setUploadingAvatar(true);
          try {
            const { error: metadataError } = await supabase.auth.updateUser({
              data: { avatar_path: null },
            });

            if (metadataError) throw metadataError;

            const { error: deleteError } = await supabase.storage
              .from('avatars')
              .remove([avatarPath]);

            if (deleteError) throw deleteError;

            setAvatarPath(null);
            setAvatarUrl(null);
            Alert.alert('Photo supprimée', 'Ta photo a été supprimée.');
          } catch (error: any) {
            Alert.alert('Erreur', error.message || 'Suppression impossible.');
          } finally {
            setUploadingAvatar(false);
          }
        },
      },
    ]);
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const { data, error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
          username: pseudo.trim(),
        },
      });

      if (authError) throw authError;
      if (!data.user) throw new Error('Utilisateur introuvable.');

      const { error } = await supabase
        .from('profile_private_details')
        .upsert({
          user_id: data.user.id,
          bio: bio.trim(),
          country: country.trim(),
          language: language.trim(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      const { error: privacyError } = await supabase
        .from('user_privacy_settings')
        .upsert({
          user_id: data.user.id,
          profile_visibility: profileVisibility,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (privacyError) throw privacyError;

      Alert.alert('Profil enregistré', 'Tes informations et ta confidentialité ont été mises à jour.');
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d’enregistrer le profil.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est définitive. Ton compte et tes données associées seront supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmation finale',
              'Es-tu certain de vouloir supprimer définitivement ton compte FreindZone ?',
              [
                { text: 'Non, garder mon compte', style: 'cancel' },
                {
                  text: 'Oui, supprimer',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { data: sessionData } = await supabase.auth.getSession();
                      const token = sessionData.session?.access_token;

                      if (!token) {
                        throw new Error('Ta session a expiré. Reconnecte-toi.');
                      }

                      const { data, error } = await supabase.functions.invoke(
                        'delete-account',
                        {
                          headers: {
                            Authorization: `Bearer ${token}`,
                          },
                        }
                      );

                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);

                      await supabase.auth.signOut();
                      Alert.alert(
                        'Compte supprimé',
                        'Ton compte FreindZone a été supprimé.'
                      );
                      router.replace('/');
                    } catch (error: any) {
                      Alert.alert(
                        'Suppression impossible',
                        error.message || 'Une erreur est survenue.'
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  async function logout() {
    Alert.alert('Déconnexion', 'Veux-tu vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) {
            Alert.alert('Erreur', error.message);
            return;
          }
          router.replace('/');
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme} />
        <Text style={styles.muted}>Chargement du profil...</Text>
      </View>
    );
  }

  const initial = (name || pseudo || email || 'F').charAt(0).toUpperCase();

  const completionFields = [name, pseudo, bio, country, language, interests, socialLanguages, icebreakers];
  const completion = Math.round((completionFields.filter((value) => value.trim().length > 0).length / completionFields.length) * 100);



  async function addGalleryPhotos() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Autorisation nécessaire', 'Autorise FriendZone à accéder à tes photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 8,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploadingAvatar(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Tu dois être connecté.');

      const userId = authData.user.id;
      const added: any[] = [];

      for (let i = 0; i < result.assets.length; i++) {
        const processed = await ImageManipulator.manipulateAsync(
          result.assets[i].uri,
          [{ resize: { width: 1000, height: 1000 } }],
          { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );

        if (!processed.base64) throw new Error('Impossible de préparer une photo.');

        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const clean = processed.base64.replace(/[^A-Za-z0-9+/=]/g, '');
        const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
        const bytes = new Uint8Array(Math.floor(clean.length * 3 / 4) - padding);
        let offset = 0;

        for (let j = 0; j < clean.length; j += 4) {
          const a = alphabet.indexOf(clean[j]);
          const b = alphabet.indexOf(clean[j + 1]);
          const c = clean[j + 2] === '=' ? 0 : alphabet.indexOf(clean[j + 2]);
          const d = clean[j + 3] === '=' ? 0 : alphabet.indexOf(clean[j + 3]);
          if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('Photo invalide.');
          if (offset < bytes.length) bytes[offset++] = (a << 2) | (b >> 4);
          if (offset < bytes.length) bytes[offset++] = ((b & 15) << 4) | (c >> 2);
          if (offset < bytes.length) bytes[offset++] = ((c & 3) << 6) | d;
        }

        if (bytes.byteLength > 8 * 1024 * 1024) {
          throw new Error('Une photo dépasse la limite de 8 Mo.');
        }

        const path = `${userId}/${Date.now()}-${i}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('profile-gallery')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;

        const { data: row, error: insertError } = await supabase
          .from('profile_gallery')
          .insert({ user_id: userId, storage_path: path, position: gallery.length + i })
          .select('storage_path, caption, position')
          .single();

        if (insertError) {
          await supabase.storage.from('profile-gallery').remove([path]);
          throw insertError;
        }

        const { data: signed, error: signedError } = await supabase.storage
          .from('profile-gallery')
          .createSignedUrl(path, 3600);
        if (signedError) throw signedError;

        added.push({ ...row, signedUrl: signed.signedUrl });
      }

      setGallery((current) => [...current, ...added]);
      Alert.alert('Galerie mise à jour', `${added.length} photo(s) ajoutée(s).`);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible d’ajouter les photos.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function removeGalleryPhoto(photo: any) {
    Alert.alert('Supprimer cette photo', 'Veux-tu vraiment supprimer cette photo de ta galerie ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setUploadingAvatar(true);
          try {
            const { error: storageError } = await supabase.storage
              .from('profile-gallery')
              .remove([photo.storage_path]);
            if (storageError) throw storageError;

            const { error: rowError } = await supabase
              .from('profile_gallery')
              .delete()
              .eq('storage_path', photo.storage_path);
            if (rowError) throw rowError;

            setGallery((current) => current.filter((item) => item.storage_path !== photo.storage_path));
            Alert.alert('Photo supprimée', 'La photo a été retirée de ta galerie.');
          } catch (error: any) {
            Alert.alert('Erreur', error.message || 'Suppression impossible.');
          } finally {
            setUploadingAvatar(false);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Mon profil</Text>
        <Text style={styles.logo}>FZ</Text>
      </View>

      <View style={styles.identity}>
        <View style={[styles.avatar, { borderColor: theme }]}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
              resizeMode="cover"
              onLoad={() => console.log("PHOTO AFFICHÉE AVEC SUCCÈS")}
              onError={(error) => console.log("ERREUR AFFICHAGE PHOTO :", error.nativeEvent.error)}
            />
          ) : (
            <Text style={styles.avatarText}>{initial}</Text>
          )}
        </View>

        <Pressable
          onPress={chooseAndUploadAvatar}
          disabled={uploadingAvatar}
          style={[styles.photoButton, { backgroundColor: theme }]}
        >
          {uploadingAvatar ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.photoButtonText}>
              {avatarUrl ? 'Changer ma photo' : 'Ajouter une photo'}
            </Text>
          )}
        </Pressable>

        {pendingPhotoUri && (
          <View style={{ width: '100%', alignItems: 'center', marginBottom: 18, padding: 16, backgroundColor: '#211B3C', borderRadius: 18 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>
              Aperçu de ta photo
            </Text>
            <Image
              source={{ uri: pendingPhotoUri }}
              style={{ width: 180, height: 180, borderRadius: 90, marginBottom: 14 }}
              resizeMode="cover"
            />
            <Pressable
              onPress={confirmAvatar}
              disabled={uploadingAvatar}
              style={{ backgroundColor: theme, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 22, marginBottom: 10, minWidth: 190, alignItems: 'center' }}
            >
              {uploadingAvatar ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Valider cette photo</Text>
              )}
            </Pressable>
            <Pressable onPress={() => { setPendingPhotoUri(null); setPendingPhotoBase64(null); }} disabled={uploadingAvatar}>
              <Text style={{ color: '#FF829B', fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        )}

        {avatarUrl && (
          <Pressable onPress={removeAvatar} disabled={uploadingAvatar}>
            <Text style={styles.removePhoto}>Supprimer ma photo</Text>
          </Pressable>
        )}

        <Text style={styles.namePreview}>{name || 'Ton nom'}</Text>
        <Text style={styles.pseudoPreview}>
          {pseudo ? `@${pseudo}` : 'Ajoute ton pseudonyme'}
        </Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <Text style={styles.section}>INFORMATIONS PERSONNELLES</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Nom et prénom</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ton nom"
          placeholderTextColor="#737B8C"
          style={styles.input}
        />

        <Text style={styles.label}>Pseudonyme</Text>
        <TextInput
          value={pseudo}
          onChangeText={setPseudo}
          placeholder="Exemple : Aziz_FZ"
          placeholderTextColor="#737B8C"
          autoCapitalize="none"
          style={styles.input}
        />

        <Text style={styles.label}>Biographie</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Présente-toi en quelques mots..."
          placeholderTextColor="#737B8C"
          multiline
          style={[styles.input, styles.bioInput]}
        />

        <Text style={styles.label}>Pays</Text>
        <TextInput
          value={country}
          onChangeText={setCountry}
          placeholder="Ton pays"
          placeholderTextColor="#737B8C"
          style={styles.input}
        />

        <Text style={styles.label}>Langue</Text>
        <TextInput
          value={language}
          onChangeText={setLanguage}
          placeholder="Français"
          placeholderTextColor="#737B8C"
          style={styles.input}
        />
      </View>


      <Text style={styles.section}>MON IDENTITÉ SOCIALE</Text>
      <View style={styles.card}>
        <Text style={styles.settingTitle}>✨ Complétion du profil · {completion}%</Text>
        <View style={{ height: 9, backgroundColor: '#292D3A', borderRadius: 8, overflow: 'hidden', marginTop: 10, marginBottom: 18 }}>
          <View style={{ width: `${completion}%`, height: 9, backgroundColor: theme, borderRadius: 8 }} />
        </View>

        <Text style={styles.settingTitle}>👀 Visites de mon profil</Text>
        <Text style={styles.muted}>{visitCount} visite(s) enregistrée(s)</Text>

        <View style={styles.separator} />
        <Text style={styles.label}>Centres d’intérêt</Text>
        <TextInput
          value={interests}
          onChangeText={setInterests}
          placeholder="Musique, sport, voyages, cinéma..."
          placeholderTextColor="#737B8C"
          style={styles.input}
        />

        <Text style={styles.label}>Autres langues</Text>
        <TextInput
          value={socialLanguages}
          onChangeText={setSocialLanguages}
          placeholder="Anglais, arabe, espagnol..."
          placeholderTextColor="#737B8C"
          style={styles.input}
        />

        <Text style={styles.label}>Brise-glace</Text>
        <Text style={styles.muted}>Une question et ta réponse par ligne, séparées par |</Text>
        <TextInput
          value={icebreakers}
          onChangeText={setIcebreakers}
          placeholder={"Ton voyage rêvé ? | Le Japon\nTa passion ? | La musique"}
          placeholderTextColor="#737B8C"
          multiline
          style={[styles.input, styles.bioInput]}
        />
      </View>

      <Text style={styles.section}>🏅 MES BADGES</Text>
      <View style={styles.card}>
        {badges.length ? badges.map((item: any, index: number) => {
          const badge = Array.isArray(item.badges) ? item.badges[0] : item.badges;
          return (
            <View key={`${item.badge_id}-${index}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#292D3A' }}>
              <Text style={styles.settingButtonText}>{badge?.icon || '🏅'} {badge?.name || 'Badge'}</Text>
              {!!badge?.description && <Text style={styles.muted}>{badge.description}</Text>}
            </View>
          );
        }) : <Text style={styles.muted}>Tes premiers badges apparaîtront ici au fil de tes activités.</Text>}
      </View>

      <Text style={styles.section}>📸 MA GALERIE</Text>
      <View style={styles.card}>
        <Text style={styles.muted}>{gallery.length} photo(s) dans ta galerie</Text>
        <Pressable
          onPress={addGalleryPhotos}
          disabled={uploadingAvatar}
          style={[styles.saveButton, { marginTop: 12, opacity: uploadingAvatar ? 0.5 : 1 }]}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "800", textAlign: "center" }}>＋ Ajouter des photos</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          {gallery.map((photo: any) => (
            <View key={photo.storage_path} style={{ width: 92, height: 112 }}>
              {photo.signedUrl ? (
                <Image
                  source={{ uri: photo.signedUrl }}
                  style={{ width: 92, height: 92, borderRadius: 12 }}
                />
              ) : (
                <View style={{ width: 92, height: 92, borderRadius: 12, backgroundColor: '#292D3A', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={styles.muted}>Photo</Text>
                </View>
              )}
              <Pressable onPress={() => removeGalleryPhoto(photo)} style={{ paddingVertical: 5 }}>
                <Text style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', fontWeight: '700' }}>Supprimer</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.section}>APPARENCE</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Couleur principale</Text>
        <View style={styles.colors}>
          {THEMES.map((item) => (
            <Pressable
              key={item.name}
              onPress={() => setTheme(item.color)}
              style={[
                styles.colorChoice,
                { backgroundColor: item.color },
                theme === item.color && styles.colorSelected,
              ]}
            />
          ))}
        </View>
        <Text style={styles.muted}>
          Couleur choisie :{' '}
          {THEMES.find((item) => item.color === theme)?.name || 'Personnalisée'}
        </Text>
      </View>

      <Text style={styles.section}>CONFIDENTIALITÉ ET COMPTE</Text>
      <View style={styles.card}>
        <Text style={styles.settingTitle}>🔒 Confidentialité du profil</Text>
        <Text style={styles.muted}>
          Choisis qui peut consulter ta biographie, ton pays et ta langue.
        </Text>

        {([
          ['public', '🌍 Public', 'Tous les membres connectés'],
          ['followers', '👥 Abonnés', 'Les personnes qui te suivent'],
          ['friends', '🤝 Amis', 'Tes amis acceptés uniquement'],
          ['private', '🔐 Privé', 'Toi uniquement'],
        ] as const).map(([value, label, description]) => (
          <Pressable
            key={value}
            onPress={() => setProfileVisibility(value)}
            style={[
              styles.settingButton,
              {
                marginTop: 10,
                borderWidth: 1,
                borderColor: profileVisibility === value ? theme : '#292D3A',
                backgroundColor: profileVisibility === value ? `${theme}20` : '#111522',
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.settingButtonText}>{label}</Text>
              <Text style={styles.muted}>{description}</Text>
            </View>
            <Text style={{ color: theme, fontWeight: '900' }}>
              {profileVisibility === value ? '✓' : '○'}
            </Text>
          </Pressable>
        ))}

        <Text style={[styles.muted, { marginTop: 12 }]}>
          Le changement sera appliqué lorsque tu appuieras sur « Enregistrer mon profil ».
        </Text>

        <View style={styles.separator} />

        <Text style={styles.settingTitle}>✉️ Adresse e-mail</Text>
        <Text style={styles.muted}>{email || 'Non renseignée'}</Text>
      </View>

      {adminRole && (
        <Pressable
          onPress={() => router.push('/admin' as any)}
          style={styles.adminButton}
        >
          <Text style={styles.adminButtonTitle}>
            {adminRole === 'moderator' ? '🛡️ Modération' : '👑 Administration'}
          </Text>
          <Text style={styles.adminButtonSubtitle}>
            FreindZone — By Elhaag · {adminRole.toUpperCase()}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={saveProfile}
        disabled={saving}
        style={[styles.saveButton, { backgroundColor: theme }]}
      >
        <Text style={styles.saveText}>
          {saving ? 'Enregistrement...' : 'Enregistrer mon profil'}
        </Text>
      </Pressable>

      <Pressable onPress={logout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>

      <Pressable onPress={deleteAccount} style={styles.deleteButton}>
        <Text style={styles.deleteText}>Supprimer mon compte</Text>
      </Pressable>

      <Text style={styles.footer}>FriendZone · Connecte-toi au monde</Text>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080B14' },
  content: { padding: 20, paddingTop: 58, paddingBottom: 24 },
  loading: {
    flex: 1,
    backgroundColor: '#080B14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#171D2C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#FFFFFF', fontSize: 32, marginTop: -5 },
  headerTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  logo: {
    color: '#B99AFF',
    fontSize: 19,
    fontWeight: '900',
    backgroundColor: '#211B3C',
    padding: 10,
    borderRadius: 12,
  },
  identity: { alignItems: 'center', marginBottom: 30 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#211B3C',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#FFFFFF', fontSize: 40, fontWeight: '900' },
  photoButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  photoButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  removePhoto: { color: '#FF829B', fontSize: 12, marginBottom: 12 },
  namePreview: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  pseudoPreview: { color: '#B99AFF', fontSize: 14, marginTop: 5 },
  email: { color: '#929BB0', fontSize: 12, marginTop: 6 },
  section: {
    color: '#B99AFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 11,
    marginTop: 10,
  },
  card: {
    backgroundColor: '#141A29',
    borderRadius: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: '#252D40',
    marginBottom: 20,
  },
  label: {
    color: '#C5CCDA',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 10,
  },
  input: {
    color: '#FFFFFF',
    backgroundColor: '#0D1320',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#293247',
  },
  bioInput: { minHeight: 85, textAlignVertical: 'top' },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginVertical: 14 },
  colorChoice: { width: 35, height: 35, borderRadius: 18 },
  colorSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  muted: { color: '#929BB0', fontSize: 12, lineHeight: 19 },
  settingTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginBottom: 7 },
  settingButton: { marginTop: 12, paddingVertical: 10 },
  settingButtonText: { color: '#B99AFF', fontSize: 13, fontWeight: '800' },
  separator: { height: 1, backgroundColor: '#2B3345', marginVertical: 17 },
  adminButton: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#211B3C',
    borderWidth: 1,
    borderColor: '#8B6CFF',
  },
  adminButtonTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  adminButtonSubtitle: {
    color: '#B99AFF',
    fontSize: 11,
    marginTop: 5,
    fontWeight: '700',
  },
  saveButton: { padding: 16, borderRadius: 14, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  logoutButton: {
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#713B4B',
    backgroundColor: '#281722',
  },
  logoutText: { color: '#FF829B', fontWeight: '800' },
  deleteButton: {
    marginTop: 12,
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7A2635',
    backgroundColor: '#241318',
  },
  deleteText: {
    color: '#FF5C77',
    fontWeight: '800',
  },
  footer: { color: '#697386', fontSize: 11, textAlign: 'center', marginTop: 28 },
});

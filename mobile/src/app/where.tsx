import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';


import { useAppTheme } from '../context/theme-context';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Image,
  Alert,
  ScrollView,
} from 'react-native';




export default function WhereScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentColor } = useAppTheme();


  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarInitials, setAvatarInitials] = useState('??');
  const [waveMembers, setWaveMembers] = useState<any[]>([]);
  const [loadingWave, setLoadingWave] = useState(false);

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

  async function loadWaveMembers() {
    setLoadingWave(true);

    try {
      const { data: current, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const currentId = current.user?.id;
      if (!currentId) return;

      const { data: presenceRows, error: presenceError } = await supabase
        .from('wave_presence')
        .select('user_id')
        .eq('is_visible', true)
        .neq('user_id', currentId)
        .limit(6);

      if (presenceError) throw presenceError;

      const ids = (presenceRows || []).map((row) => row.user_id);

      if (ids.length === 0) {
        setWaveMembers([]);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_path')
        .in('id', ids);

      if (error) throw error;

      const members = await Promise.all(
        (data || []).map(async (member) => {
          let photoUrl: string | null = null;

          if (member.avatar_path) {
            const { data: signed } = await supabase.storage
              .from('avatars')
              .createSignedUrl(member.avatar_path, 3600);

            photoUrl = signed?.signedUrl || null;
          }

          return { ...member, photoUrl };
        })
      );

      setWaveMembers(members);
    } catch (error) {
      console.log('Erreur chargement Wave :', error);
    } finally {
      setLoadingWave(false);
    }
  }

  const [visible, setVisible] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [radius, setRadius] = useState(5);
  const [radarActive, setRadarActive] = useState(false);

  useEffect(() => {
    async function loadPresence() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const userId = auth.user?.id;
        if (!userId) throw new Error('Utilisateur non connecté');

        const { data, error } = await supabase
          .from('wave_presence')
          .select('is_visible')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;

        setVisible(data?.is_visible ?? false);
      } catch (error) {
        console.log('Erreur de lecture de la présence :', error);
        Alert.alert('Wave', 'Impossible de charger ta visibilité.');
      } finally {
        setLoaded(true);
      }
    }

    loadPresence();
    loadWaveMembers();
  }, []);

  async function changePresence(value: boolean) {
    setSaving(true);

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const userId = auth.user?.id;
      if (!userId) throw new Error('Utilisateur non connecté');

      const { error } = await supabase
        .from('wave_presence')
        .upsert(
          {
            user_id: userId,
            is_visible: value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setVisible(value);
      await loadWaveMembers();
    } catch (error) {
      console.log('Erreur de sauvegarde Wave :', error);
      Alert.alert('Wave', 'Impossible d’enregistrer ta visibilité. Réessaie.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={accentColor} />
        <Text style={styles.loadingText}>Chargement de ta présence...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Wave</Text>
        <Pressable onPress={() => router.push('/profile')} style={[styles.profileButton, { backgroundColor: accentColor, borderColor: accentColor }]}>

          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.profileButtonText, { color: '#FFFFFF' }]}>{avatarInitials}</Text>
          )}

        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <View style={styles.iconCircle}>
          <Text style={styles.icon}>📍</Text>
        </View>

        <Text style={styles.title}>Ta présence</Text>
        <Text style={styles.description}>
          Choisis si les autres membres de FriendZone peuvent voir ta présence.
        </Text>

        <View style={styles.radarCard}>
          <View style={styles.radarHeading}>
            <Text style={styles.radarTitle}>📡 Radar FriendZone</Text>
            <Text style={styles.radarBadge}>APERÇU</Text>
          </View>

          <Text style={styles.radarDescription}>
            Découvre les membres qui choisiront d'être visibles autour de toi.
          </Text>

          <View style={styles.radar}>
            <View style={styles.radarRingOuter}>
              <View style={styles.radarRingMiddle}>
                <View style={[styles.radarRingInner, { borderColor: accentColor }]}>
                  <View style={[styles.radarCenter, { backgroundColor: accentColor }]}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.radarCenterImage} />
                    ) : (
                      <Text style={styles.radarCenterText}>{avatarInitials}</Text>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {waveMembers.slice(0, 6).map((member, index) => {
              const positions = [
                styles.waveMemberOne,
                styles.waveMemberTwo,
                styles.waveMemberThree,
                styles.waveMemberFour,
                styles.waveMemberFive,
                styles.waveMemberSix,
              ];

              const name = member.full_name || member.username || 'Membre';
              const initial = name.charAt(0).toUpperCase();

              return (
                <Pressable
                  key={member.id}
                  style={[styles.waveMember, positions[index], { backgroundColor: accentColor }]}
                  onPress={() => console.log('Profil Wave :', member.id)}
                >
                  {member.photoUrl ? (
                    <Image source={{ uri: member.photoUrl }} style={styles.waveMemberImage} />
                  ) : (
                    <Text style={styles.waveMemberInitial}>{initial}</Text>
                  )}
                </Pressable>
              );
            })}

            {loadingWave && (
              <ActivityIndicator
                style={styles.waveLoading}
                size="small"
                color={accentColor}
              />
            )}
          </View>

          <Text style={styles.radiusLabel}>Distance de recherche</Text>
          <View style={styles.radiusOptions}>
            {[1, 3, 5, 10].map((km) => (
              <Pressable
                key={km}
                onPress={() => setRadius(km)}
                style={[styles.radiusButton, radius === km && [styles.radiusSelected, { backgroundColor: accentColor }]]}
              >
                <Text style={[styles.radiusText, radius === km && styles.radiusTextSelected]}>
                  {km} km
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.radarAction, { backgroundColor: accentColor }, !visible && styles.radarDisabled]}
            disabled={!visible}
            onPress={() => setRadarActive(!radarActive)}
          >
            <Text style={styles.radarActionText}>
              {radarActive ? 'Radar désactivé' : 'Préparer le radar'}
            </Text>
          </Pressable>

          <Text style={styles.radarNotice}>
            {radarActive
              ? 'Aperçu activé. La recherche réelle des membres reste à connecter.'
              : 'Aucun profil réel n’est encore recherché. La connexion géolocalisation sera ajoutée ensuite.'}
          </Text>
        </View>

        <View style={styles.presenceCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: visible ? '#22C55E' : '#737B8C' }]} />
            <Text style={styles.statusText}>
              {visible ? 'Tu es visible' : 'Tu es invisible'}
            </Text>
          </View>

          <Text style={styles.cardDescription}>
            {visible
              ? 'Les autres membres pourront découvrir ta présence.'
              : 'Tu n’apparais plus dans les recherches de proximité.'}
          </Text>

          <View style={styles.separator} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>
                {visible ? 'Mode visible' : 'Mode invisible'}
              </Text>
              <Text style={styles.switchDescription}>
                {visible ? 'Désactive pour te cacher.' : 'Active pour être découvert.'}
              </Text>
            </View>

            <Switch
              value={visible}
              onValueChange={changePresence}
              disabled={saving || !loaded}
              trackColor={{ false: '#41485A', true: accentColor }}
              thumbColor={visible ? '#FFFFFF' : '#D1D5DB'}
            />
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔒 Ta confidentialité</Text>
          <Text style={styles.infoText}>
            Ton choix est enregistré sur ton compte. Ta position exacte n’est pas affichée.
          </Text>
        </View>

        <Text style={styles.savedText}>
          {saving ? 'Enregistrement...' : '✓ Préférence synchronisée avec ton compte'}
        </Text>
      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({

  radarCenterImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  waveMember: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#292044',
    borderWidth: 2,
    borderColor: '#8B72FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveMemberImage: {
    width: '100%',
    height: '100%',
  },
  waveMemberInitial: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  waveMemberOne: { top: 18, right: '24%' },
  waveMemberTwo: { top: 65, left: '10%' },
  waveMemberThree: { top: 112, right: '12%' },
  waveMemberFour: { bottom: 18, left: '28%' },
  waveMemberFive: { top: 35, right: '8%' },
  waveMemberSix: { bottom: 48, right: '30%' },
  waveLoading: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
  },

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

  screen: { flex: 1, backgroundColor: '#080B14' },
  loading: {
    flex: 1,
    backgroundColor: '#080B14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#AAB0C0', marginTop: 14 },
  header: {
    height: 82,
    paddingTop: 22,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#171D2C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#FFFFFF', fontSize: 32, marginTop: -5 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  content: { padding: 24, paddingBottom: 24, alignItems: 'center' },
  iconCircle: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: '#211B3C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  icon: { fontSize: 38 },
  title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginBottom: 10 },
  description: {
    color: '#A0A7B8',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 30,
  },
  radarCard: {
    width: '100%',
    backgroundColor: '#141A29',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#39305F',
    marginBottom: 18,
  },
  radarHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  radarTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  radarBadge: { color: '#B99AFF', fontSize: 10, fontWeight: '900' },
  radarDescription: { color: '#A0A7B8', fontSize: 12, lineHeight: 19, marginTop: 9 },
  radar: { height: 190, alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  radarRingOuter: {
    width: 178, height: 178, borderRadius: 89, borderWidth: 1,
    borderColor: '#6250A0', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#191D38',
  },
  radarRingMiddle: {
    width: 126, height: 126, borderRadius: 63, borderWidth: 1,
    borderColor: '#6250A0', alignItems: 'center', justifyContent: 'center',
  },
  radarRingInner: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 1,
    borderColor: '#8064FA', alignItems: 'center', justifyContent: 'center',
  },
  radarCenter: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#7655E8',
    alignItems: 'center', justifyContent: 'center',
  },
  radarCenterText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  radarPointOne: { position: 'absolute', top: 35, left: '29%', width: 10, height: 10, borderRadius: 5, backgroundColor: '#42D9FF' },
  radarPointTwo: { position: 'absolute', top: 65, right: '24%', width: 10, height: 10, borderRadius: 5, backgroundColor: '#F46CB5' },
  radarPointThree: { position: 'absolute', bottom: 34, right: '35%', width: 10, height: 10, borderRadius: 5, backgroundColor: '#A78BFA' },
  radiusLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginTop: 4 },
  radiusOptions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  radiusButton: { flex: 1, paddingVertical: 10, borderRadius: 11, backgroundColor: '#222A3D', alignItems: 'center' },
  radiusSelected: { backgroundColor: '#7655E8' },
  radiusText: { color: '#C4CADD', fontSize: 12, fontWeight: '700' },
  radiusTextSelected: { color: '#FFFFFF' },
  radarAction: { backgroundColor: '#7655E8', padding: 14, borderRadius: 13, alignItems: 'center', marginTop: 15 },
  radarDisabled: { opacity: 0.4 },
  radarActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  radarNotice: { color: '#929BB0', fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 10 },
  presenceCard: {
    width: '100%',
    backgroundColor: '#141A29',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#252D40',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  cardDescription: { color: '#A0A7B8', fontSize: 13, lineHeight: 20, marginTop: 10 },
  separator: { height: 1, backgroundColor: '#2B3345', marginVertical: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  switchDescription: { color: '#929BAE', fontSize: 12, marginTop: 5 },
  infoCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 17,
    padding: 17,
    marginTop: 18,
  },
  infoTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginBottom: 8 },
  infoText: { color: '#9CA3AF', fontSize: 12, lineHeight: 19 },
  savedText: { color: '#8E9AAF', fontSize: 11, marginTop: 22 },
});

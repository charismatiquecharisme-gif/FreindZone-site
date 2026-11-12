import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Image,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView,
  Alert, ActivityIndicator, Modal, FlatList
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

const intentions = [
  'Amitié',
  'Discussion et faire connaissance',
  'Rencontre amoureuse',
  'Relation sérieuse',
  'Mariage',
  'Sorties et activités',
  'Rencontres sans engagement',
  'Élargir mon cercle social',
];

const genders = ['Femme', 'Homme', 'Autre', 'Préfère ne pas dire'];

const countryCodes = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');

const countryLabels: Record<string, string> = {
  AD: 'Andorre', AE: 'Émirats arabes unis', AF: 'Afghanistan',
  AL: 'Albanie', DZ: 'Algérie', DE: 'Allemagne',
  AO: 'Angola', AR: 'Argentine', AU: 'Australie',
  BE: 'Belgique', BJ: 'Bénin', BF: 'Burkina Faso',
  BR: 'Brésil', BI: 'Burundi', CM: 'Cameroun',
  CA: 'Canada', CV: 'Cap-Vert', CF: 'République centrafricaine',
  TD: 'Tchad', CL: 'Chili', CN: 'Chine',
  CO: 'Colombie', KM: 'Comores', CG: 'Congo',
  CD: 'République démocratique du Congo', CI: "Côte d’Ivoire",
  HR: 'Croatie', DK: 'Danemark', EG: 'Égypte',
  ES: 'Espagne', US: 'États-Unis', FI: 'Finlande',
  FR: 'France', GA: 'Gabon', GM: 'Gambie',
  GH: 'Ghana', GN: 'Guinée', GW: 'Guinée-Bissau',
  IN: 'Inde', ID: 'Indonésie', IE: 'Irlande',
  IT: 'Italie', JP: 'Japon', KE: 'Kenya',
  LB: 'Liban', LU: 'Luxembourg', MG: 'Madagascar',
  ML: 'Mali', MA: 'Maroc', MR: 'Mauritanie',
  MX: 'Mexique', NE: 'Niger', NG: 'Nigeria',
  NL: 'Pays-Bas', NO: 'Norvège', PK: 'Pakistan',
  PT: 'Portugal', GB: 'Royaume-Uni', RU: 'Russie',
  RW: 'Rwanda', SN: 'Sénégal', RS: 'Serbie',
  CH: 'Suisse', SE: 'Suède', TG: 'Togo',
  TN: 'Tunisie', TR: 'Turquie', UA: 'Ukraine',
  ZA: 'Afrique du Sud'
};

const countries = countryCodes
  .map(code => ({ code, name: countryLabels[code] || code }))
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

const months = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];


function isAdult(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  if (
    birth.getFullYear() !== y ||
    birth.getMonth() !== m - 1 ||
    birth.getDate() !== d
  ) return false;

  const today = new Date();
  const limit = new Date(
    today.getFullYear() - 18,
    today.getMonth(),
    today.getDate()
  );
  return birth <= limit;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthDay, setBirthDay] = useState(1);
  const [birthMonth, setBirthMonth] = useState(1);
  const [birthYear, setBirthYear] = useState(new Date().getFullYear() - 18);
  const [birthCountry, setBirthCountry] = useState('');
  const [countryModal, setCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [intention, setIntention] = useState('');
  const [loading, setLoading] = useState(false);

  const maxDays = new Date(birthYear, birthMonth, 0).getDate();

  function changeDate(type: 'day' | 'month' | 'year', direction: number) {
    let day = birthDay;
    let month = birthMonth;
    let year = birthYear;

    if (type === 'day') day = day + direction;
    if (type === 'month') month = month + direction;
    if (type === 'year') year = year + direction;

    if (month < 1) month = 12;
    if (month > 12) month = 1;
    if (year < 1900) year = new Date().getFullYear() - 18;
    if (year > new Date().getFullYear() - 18) year = 1900;

    const days = new Date(year, month, 0).getDate();
    day = Math.min(day, days);
    if (day < 1) day = days;

    setBirthDay(day);
    setBirthMonth(month);
    setBirthYear(year);
    setBirthDate(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
  }

  async function handleSubmit() {
      const selectedDate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert('Adresse e-mail', 'Entre une adresse e-mail valide.');
      return;
    }

    if (mode !== 'forgot' && password.length < 6) {
      Alert.alert('Mot de passe', 'Utilise au moins 6 caractères.');
      return;
    }

    if (mode === 'signup') {
      if (
        !firstName.trim() || !lastName.trim() || !gender ||
        !birthCountry.trim() || !intention
      ) {
        Alert.alert('Formulaire incomplet', 'Remplis tous les champs et choisis ton type de rencontre.');
        return;
      }

      if (!isAdult(selectedDate)) {
        Alert.alert(
          'Âge non valide',
          'FreindZone est réservé aux personnes de 18 ans ou plus. Vérifie ta date de naissance.'
        );
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail, password,
        });
        if (error) throw error;
        router.replace('/home' as any);
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: Linking.createURL('auth/callback'),
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              gender,
              birth_date: selectedDate,
              birth_country: birthCountry.trim(),
              connection_intention: intention,
            },
          },
        });
        if (error) throw error;

        if (data.session) {
          router.replace('/home' as any);
        } else {
          Alert.alert(
            'Vérifie ta boîte e-mail',
            'Si ton compte a été créé, ouvre le message de confirmation envoyé par Supabase. Confirme ton adresse avant de te connecter.'
          );
          setMode('login');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
        if (error) throw error;
        Alert.alert(
          'Demande envoyée',
          'Si cette adresse correspond à un compte, tu recevras un e-mail de réinitialisation.'
        );
        setMode('login');
      }
    } catch (error: any) {
      Alert.alert(
        'Impossible de continuer',
        error?.message || 'Une erreur est survenue. Vérifie ta connexion et Supabase.'
      );
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  function field(label: string, value: string, setter: (v: string) => void, placeholder: string, props: any = {}) {
    return (
      <>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inputBox}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setter}
            placeholder={placeholder}
            placeholderTextColor="#85859D"
            {...props}
          />
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 28 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.glow} />

        <View style={styles.header}>
          <Image
            source={require('../../assets/images/friendzone-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.brand}>
            <Text style={{color:'#4285FF'}}>F</Text><Text style={{color:'#6274FF'}}>r</Text><Text style={{color:'#8064FA'}}>i</Text><Text style={{color:'#A45BEF'}}>e</Text><Text style={{color:'#C653DC'}}>n</Text><Text style={{color:'#DB50C4'}}>d</Text><Text style={{color:'#E653B5'}}>Z</Text><Text style={{color:'#ED62A9'}}>o</Text><Text style={{color:'#F178A1'}}>n</Text><Text style={{color:'#F58D9B'}}>e</Text>
          </Text>
          <Text style={styles.tagline}>Le monde est plus proche ensemble.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>
            {isForgot ? 'Réinitialiser' : isSignup ? 'Créer mon compte' : 'Bienvenue 👋'}
          </Text>
          <Text style={styles.subtitle}>
            {isForgot
              ? 'Entre ton e-mail pour recevoir les instructions.'
              : isSignup
              ? 'Fais connaissance avec ta communauté.'
              : 'Connecte-toi pour retrouver ta communauté.'}
          </Text>

          {isSignup && (
            <>
              {field('PRÉNOM', firstName, setFirstName, 'Ton prénom', { autoCapitalize: 'words' })}
              {field('NOM', lastName, setLastName, 'Ton nom', { autoCapitalize: 'words' })}

              <Text style={styles.label}>SEXE</Text>
              <View style={styles.choices}>
                {genders.map(item => (
                  <Pressable
                    key={item}
                    onPress={() => setGender(item)}
                    style={[styles.choice, gender === item && styles.choiceSelected]}
                  >
                    <Text style={[styles.choiceText, gender === item && styles.choiceTextSelected]}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>DATE DE NAISSANCE</Text>
              <View style={styles.dateRow}>
                {[
                  { label: 'JOUR', value: String(birthDay).padStart(2, '0'), type: 'day' as const },
                  { label: 'MOIS', value: months[birthMonth - 1], type: 'month' as const },
                  { label: 'ANNÉE', value: String(birthYear), type: 'year' as const },
                ].map(item => (
                  <View key={item.type} style={styles.dateColumn}>
                    <Text style={styles.dateLabel}>{item.label}</Text>
                    <View style={styles.dateControl}>
                      <Pressable
                        onPress={() => changeDate(item.type, -1)}
                        style={styles.dateArrow}
                        accessibilityLabel={`Précédent ${item.label}`}
                      >
                        <Text style={styles.dateArrowText}>‹</Text>
                      </Pressable>
                      <Text style={styles.dateValue}>{item.value}</Text>
                      <Pressable
                        onPress={() => changeDate(item.type, 1)}
                        style={styles.dateArrow}
                        accessibilityLabel={`Suivant ${item.label}`}
                      >
                        <Text style={styles.dateArrowText}>›</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.dateFormat}>
                {String(birthDay).padStart(2, '0')}/{String(birthMonth).padStart(2, '0')}/{birthYear}
              </Text>
              <Text style={styles.hint}>Inscription réservée aux personnes de 18 ans ou plus.</Text>

              <Text style={styles.label}>PAYS DE NAISSANCE</Text>
              <Pressable
                style={styles.inputBox}
                onPress={() => setCountryModal(true)}
              >
                <Text style={[styles.input, !birthCountry && { color: '#85859D' }]}>
                  {birthCountry || 'Choisir un pays'}
                </Text>
                <Text style={styles.dateArrowText}>⌄</Text>
              </Pressable>

              <Modal
                visible={countryModal}
                animationType="slide"
                transparent
                onRequestClose={() => setCountryModal(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.countryPanel}>
                    <Text style={styles.title}>Choisir un pays</Text>
                    <View style={styles.inputBox}>
                      <TextInput
                        style={styles.input}
                        value={countrySearch}
                        onChangeText={setCountrySearch}
                        placeholder="Rechercher un pays..."
                        placeholderTextColor="#85859D"
                        autoCorrect={false}
                      />
                    </View>
                    <FlatList
                      data={countries.filter(item =>
                        item.name.toLowerCase().includes(countrySearch.toLowerCase())
                      )}
                      keyExtractor={item => item.code}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <Pressable
                          style={styles.countryItem}
                          onPress={() => {
                            setBirthCountry(item.name);
                            setCountryModal(false);
                            setCountrySearch('');
                          }}
                        >
                          <Text style={styles.countryText}>{item.name}</Text>
                          {birthCountry === item.name &&
                            <Text style={styles.dateArrowText}>✓</Text>}
                        </Pressable>
                      )}
                    />
                    <Pressable
                      style={styles.signup}
                      onPress={() => setCountryModal(false)}
                    >
                      <Text style={styles.signupText}>Fermer</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>

              <Text style={styles.label}>QUEL TYPE DE RENCONTRE RECHERCHES-TU ?</Text>
              <View style={styles.choices}>
                {intentions.map(item => (
                  <Pressable
                    key={item}
                    onPress={() => setIntention(item)}
                    style={[styles.choice, intention === item && styles.choiceSelected]}
                  >
                    <Text style={[styles.choiceText, intention === item && styles.choiceTextSelected]}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {field(
            'ADRESSE E-MAIL',
            email,
            setEmail,
            'exemple@email.com',
            { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false }
          )}

          {!isForgot && (
            <>
              <Text style={styles.label}>MOT DE PASSE</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Au moins 6 caractères"
                  placeholderTextColor="#85859D"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Text style={styles.showPassword}>{showPassword ? 'Masquer' : 'Voir'}</Text>
                </Pressable>
              </View>
            </>
          )}

          {mode === 'login' && (
            <Pressable style={styles.forgot} onPress={() => setMode('forgot')}>
              <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.button, loading && styles.disabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.buttonText}>
                  {isForgot ? 'Envoyer les instructions →' : isSignup ? 'Créer mon compte →' : 'Se connecter →'}
                </Text>}
          </Pressable>
<View style={styles.separator}>
            <View style={styles.line} />
            <Text style={styles.or}>
              {isForgot ? 'TU AS RETROUVÉ TON MOT DE PASSE ?' : isSignup ? 'DÉJÀ INSCRIT ?' : 'NOUVEAU SUR FRIENDZONE ?'}
            </Text>
            <View style={styles.line} />
          </View>

          <Pressable
            style={styles.signup}
            onPress={() => setMode(isForgot || isSignup ? 'login' : 'signup')}
          >
            <Text style={styles.signupText}>
              {isForgot || isSignup ? 'Retour à la connexion' : 'Créer un compte'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          En continuant, tu acceptes nos conditions d’utilisation et notre politique de confidentialité.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101026' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: 45, paddingBottom: 28 },
  glow: { position: 'absolute', top: 30, right: -100, width: 260, height: 260, borderRadius: 130, backgroundColor: '#35246A', opacity: 0.45 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoImage: { width: 84, height: 84, marginBottom: 13 },
  brand: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  brandAccent: { color: '#69E7FF' },
  tagline: { color: '#A6A6C4', fontSize: 13, marginTop: 7 },
  card: { backgroundColor: '#1A1A35', borderRadius: 26, borderWidth: 1, borderColor: '#343354', padding: 23 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#A9A9C4', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 26 },
  label: { color: '#C4C4DF', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 9, marginTop: 12 },
  inputBox: { minHeight: 55, flexDirection: 'row', alignItems: 'center', backgroundColor: '#111126', borderRadius: 14, borderWidth: 1, borderColor: '#373653', paddingHorizontal: 13, marginBottom: 12 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 13 },
  hint: { color: '#A9A9C4', fontSize: 11, marginBottom: 8 },
  dateRow: { flexDirection: 'row', gap: 7, marginBottom: 4 },
  dateColumn: { flex: 1 },
  dateLabel: { color: '#9695B2', fontSize: 9, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  dateControl: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111126', borderRadius: 12, borderWidth: 1, borderColor: '#373653' },
  dateArrow: { paddingHorizontal: 9, paddingVertical: 8 },
  dateArrowText: { color: '#78DFF6', fontSize: 22, fontWeight: '700' },
  dateValue: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  dateFormat: { color: '#A9A9C4', fontSize: 12, textAlign: 'right', marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  countryPanel: { height: '80%', backgroundColor: '#1A1A35', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  countryItem: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: '#343354', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  countryText: { color: '#FFFFFF', fontSize: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  choice: { borderRadius: 12, borderWidth: 1, borderColor: '#484568', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#111126' },
  choiceSelected: { borderColor: '#69E7FF', backgroundColor: '#292650' },
  choiceText: { color: '#C4C4DF', fontSize: 12 },
  choiceTextSelected: { color: '#69E7FF', fontWeight: '700' },
  showPassword: { color: '#76DFF5', fontSize: 12, fontWeight: '700', paddingLeft: 8 },
  forgot: { alignSelf: 'flex-end', marginTop: 2, marginBottom: 18 },
  forgotText: { color: '#78DFF6', fontSize: 12, fontWeight: '600' },
  button: { minHeight: 54, borderRadius: 15, backgroundColor: '#7668FF', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, textAlign: 'center', paddingHorizontal: 8 },
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: 24, gap: 8 },
  line: { height: 1, flex: 1, backgroundColor: '#393752' },
  or: { color: '#9695B2', fontSize: 8, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  signup: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#555080', alignItems: 'center', justifyContent: 'center' },
  signupText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  footer: { color: '#777793', fontSize: 10, textAlign: 'center', lineHeight: 17, marginTop: 22, paddingHorizontal: 12 },
});

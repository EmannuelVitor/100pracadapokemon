const sdk = 'https://www.gstatic.com/firebasejs/13.3.0';
let firebase;
let auth;

export const authReady = (async () => {
  try {
    if (document.body.hasAttribute('data-solo-preview')) return false;
    const response = await fetch('/__/firebase/init.json');
    if (!response.ok) return false;
    const config = await response.json();
    if (!config.apiKey || !config.authDomain) return false;
    const [{ initializeApp }, authModule] = await Promise.all([
      import(`${sdk}/firebase-app.js`), import(`${sdk}/firebase-auth.js`),
    ]);
    firebase = authModule;
    auth = firebase.getAuth(initializeApp(config));
    auth.languageCode = 'pt-BR';
    await auth.authStateReady();
    return true;
  } catch {
    return false;
  }
})();

export async function watchAccount(listener) {
  if (await authReady) firebase.onAuthStateChanged(auth, listener);
}

export function getUser() { return auth?.currentUser; }

export async function googleSignIn() {
  if (!await authReady) throw new Error('A conexão com o Firebase está indisponível.');
  try {
    await firebase.signInWithPopup(auth, new firebase.GoogleAuthProvider());
  } catch (error) {
    if (error.code !== 'auth/multi-factor-auth-required') throw error;
    const resolver = firebase.getMultiFactorResolver(auth, error);
    const factor = resolver.hints.find(hint => hint.factorId === firebase.TotpMultiFactorGenerator.FACTOR_ID);
    if (!factor) throw new Error('O segundo fator desta conta é incompatível com o jogo.');
    return code => resolver.resolveSignIn(firebase.TotpMultiFactorGenerator.assertionForSignIn(factor.uid, code));
  }
}

export const signOut = () => firebase.signOut(auth);
export const hasAuthenticator = user => Boolean(user && firebase.multiFactor(user).enrolledFactors
  .some(factor => factor.factorId === firebase.TotpMultiFactorGenerator.FACTOR_ID));

export async function startAuthenticator() {
  const user = getUser();
  if (!user) throw new Error('Entre com sua conta Google.');
  await firebase.reauthenticateWithPopup(user, new firebase.GoogleAuthProvider());
  const factor = firebase.multiFactor(user);
  const secret = await firebase.TotpMultiFactorGenerator.generateSecret(await factor.getSession());
  return {
    key: secret.secretKey,
    confirm: async code => {
      await factor.enroll(firebase.TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Google Authenticator');
      await user.reload();
    },
  };
}

export function authMessage(error) {
  return ({
    'auth/popup-closed-by-user': 'A janela de login foi fechada.',
    'auth/popup-blocked': 'Permita pop-ups do site para abrir o login Google.',
    'auth/operation-not-allowed': 'Este método de autenticação ainda está indisponível no projeto.',
    'auth/unsupported-first-factor': 'Entre com uma conta Google com e-mail verificado.',
    'auth/unauthorized-domain': 'Este endereço ainda precisa ser autorizado no Firebase.',
    'auth/invalid-verification-code': 'Código inválido ou expirado. Tente o código atual.',
    'auth/invalid-multi-factor-session': 'A configuração expirou. Gere uma nova chave.',
    'auth/network-request-failed': 'Verifique sua conexão e tente novamente.',
  })[error.code] || (error.code?.startsWith('auth/') ? 'O Firebase não concluiu a autenticação.' : error.message);
}

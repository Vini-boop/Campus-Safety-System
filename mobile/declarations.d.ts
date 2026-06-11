// @react-native-async-storage v2 ships its own types but the TS server
// sometimes can't resolve them — this declaration suppresses the false positive.
declare module '@react-native-async-storage/async-storage';

// expo-notifications types
declare module 'expo-notifications';

// react-native-webview
declare module 'react-native-webview';

// firebase v11 types are missing from this install (no .d.ts in node_modules/firebase).
// Explicit types are annotated inline in files that use firebase/firestore.
declare module 'firebase/firestore' {
    export * from '@firebase/firestore';
}
declare module 'firebase/auth' {
    export * from '@firebase/auth';
}
declare module 'firebase/storage' {
    export * from '@firebase/storage';
}
declare module 'firebase/app' {
    export * from '@firebase/app';
}

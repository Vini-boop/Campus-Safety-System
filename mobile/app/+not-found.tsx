import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function NotFound() {
    const router = useRouter();
    return (
        <View style={s.container}>
            <Text style={s.emoji}>🏥</Text>
            <Text style={s.title}>Page not found</Text>
            <Text style={s.sub}>This route does not exist.</Text>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/(tabs)')}>
                <Text style={s.btnText}>Go to Home</Text>
            </TouchableOpacity>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5', padding: 32 },
    emoji: { fontSize: 56, marginBottom: 16 },
    title: { fontSize: 22, fontWeight: '800', color: '#0C156D', marginBottom: 8 },
    sub: { fontSize: 14, color: '#666', marginBottom: 32 },
    btn: { backgroundColor: '#0C156D', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

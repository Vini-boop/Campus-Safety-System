import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

const DOT_SIZE = 12;
const RING_RADIUS = 30;

export function CustomSpinner() {
    const animationValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(animationValue, {
                toValue: 1,
                duration: 2500, // 2.5 seconds loop
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();
    }, [animationValue]);

    const spin = animationValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const scale = animationValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1.3, 1],
    });

    const dots = Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * Math.PI) / 4; // 45 degrees per dot
        const isEven = i % 2 === 0; // 0-indexed: 0, 2, 4, 6 -> dots 1, 3, 5, 7
        const color = isEven ? '#FFFFFF' : 'rgba(166, 143, 217, 0.6)';

        const x = Math.cos(angle) * RING_RADIUS;
        const y = Math.sin(angle) * RING_RADIUS;

        return (
            <View
                key={i}
                style={[
                    styles.dot,
                    {
                        backgroundColor: color,
                        transform: [{ translateX: x }, { translateY: y }],
                    },
                ]}
            />
        );
    });

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.ring,
                    {
                        transform: [{ rotate: spin }, { scale: scale }],
                    },
                ]}
            >
                {dots}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        width: RING_RADIUS * 2 + DOT_SIZE,
        height: RING_RADIUS * 2 + DOT_SIZE,
    },
    ring: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dot: {
        position: 'absolute',
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
    },
});

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ArrowsPointingOutIcon,
    ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

/**
 * MediaViewer Component
 * Image gallery modal with zoom and navigation
 */
const MediaViewer = ({ mediaUrls, isOpen, onClose, initialIndex = 0 }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoom, setZoom] = useState(1);

    if (!isOpen || !mediaUrls || mediaUrls.length === 0) return null;

    const currentImage = mediaUrls[currentIndex];
    const totalImages = mediaUrls.length;

    const handlePrevious = () => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalImages - 1));
        setZoom(1);
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev < totalImages - 1 ? prev + 1 : 0));
        setZoom(1);
    };

    const handleZoomIn = () => {
        setZoom((prev) => Math.min(prev + 0.5, 3));
    };

    const handleZoomOut = () => {
        setZoom((prev) => Math.max(prev - 0.5, 1));
    };

    const handleDownload = async () => {
        try {
            const response = await fetch(currentImage);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `report-image-${currentIndex + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center">
            {/* Header Controls */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="text-white">
                        <p className="text-sm text-gray-300">
                            Image {currentIndex + 1} of {totalImages}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleZoomOut}
                            disabled={zoom <= 1}
                            className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            title="Zoom Out"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                            </svg>
                        </button>

                        <span className="text-white text-sm px-2">{Math.round(zoom * 100)}%</span>

                        <button
                            onClick={handleZoomIn}
                            disabled={zoom >= 3}
                            className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            title="Zoom In"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                            </svg>
                        </button>

                        <button
                            onClick={toggleFullscreen}
                            className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                            title="Toggle Fullscreen"
                        >
                            <ArrowsPointingOutIcon className="w-5 h-5" />
                        </button>

                        <button
                            onClick={handleDownload}
                            className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                            title="Download"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                        </button>

                        <button
                            onClick={onClose}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            title="Close"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Image Container */}
            <div className={`relative ${isFullscreen ? 'w-full h-full' : 'w-11/12 h-5/6'} flex items-center justify-center overflow-hidden`}>
                <AnimatePresence mode="wait">
                    <motion.img
                        key={currentIndex}
                        src={currentImage}
                        alt={`Report image ${currentIndex + 1}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: zoom }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3 }}
                        className="max-w-full max-h-full object-contain cursor-move"
                        draggable={false}
                        style={{
                            transform: `scale(${zoom})`,
                            transition: 'transform 0.2s ease-out'
                        }}
                    />
                </AnimatePresence>

                {/* Navigation Buttons */}
                {totalImages > 1 && (
                    <>
                        <button
                            onClick={handlePrevious}
                            className="absolute left-4 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors backdrop-blur-sm"
                        >
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>

                        <button
                            onClick={handleNext}
                            className="absolute right-4 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors backdrop-blur-sm"
                        >
                            <ChevronRightIcon className="w-6 h-6" />
                        </button>
                    </>
                )}
            </div>

            {/* Thumbnail Strip */}
            {totalImages > 1 && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center gap-2 max-w-4xl mx-auto overflow-x-auto pb-2">
                        {mediaUrls.map((url, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    setCurrentIndex(index);
                                    setZoom(1);
                                }}
                                className={`
                  flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all
                  ${index === currentIndex ? 'border-blue-500 scale-110' : 'border-transparent opacity-60 hover:opacity-100'}
                `}
                            >
                                <img
                                    src={url}
                                    alt={`Thumbnail ${index + 1}`}
                                    className="w-full h-full object-cover"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Keyboard Navigation Hint */}
            <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 text-gray-400 text-sm">
                Use arrow keys to navigate • ESC to close
            </div>
        </div>
    );
};

export default MediaViewer;

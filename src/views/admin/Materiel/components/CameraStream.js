import React, { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';

const CameraStream = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    const startCamera = async () => {
      if (Capacitor.isNativePlatform()) {
        // Plateformes natives (Android ou iOS)
        try {
          await CameraPreview.start({
            position: 'rear',
            toBack: false,
            width: window.innerWidth,
            height: window.innerHeight,
            parent: 'cameraPreview', // ID de l'élément parent
          });
        } catch (err) {
          console.error('Erreur lors de l\'accès à la caméra sur la plateforme native', err);
        }
      } else {
        // Exécution sur le web
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        } catch (err) {
          console.error('Erreur lors de l\'accès à la caméra sur le web', err);
        }
      }
    };

    startCamera();

    return () => {
      if (Capacitor.isNativePlatform()) {
        CameraPreview.stop();
      } else {
        if (videoRef.current && videoRef.current.srcObject) {
          // eslint-disable-next-line
          let tracks = videoRef.current.srcObject.getTracks();
          tracks.forEach((track) => track.stop());
        }
      }
    };
  }, []);

  return (
    <div>
      {Capacitor.isNativePlatform() ? (
        <div id="cameraPreview" style={{ width: '100%', height: '100%' }}></div>
      ) : (
        <video
          ref={videoRef}
          style={{ width: '100%', height: 'auto' }}
          autoPlay
          playsInline
        />
      )}
    </div>
  );
};

export default CameraStream;

// src/views/admin/Materiel/components/VideoCaptureBisBis.jsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { supabase } from './../../../../supabaseClient';
import {
  ModalCloseButton, Box, Text, VStack, Badge, Alert, AlertIcon, IconButton,
  Tooltip, Button, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, useDisclosure, useToast, HStack, Select
} from '@chakra-ui/react';
import QRCode from 'qrcode.react';
import { FcDisclaimer, FcOk } from "react-icons/fc";
import { useEvent } from './../../../../EventContext';
import { useHistory } from 'react-router-dom';
import { useTeam } from './../../../../views/admin/InterfaceEquipe/TeamContext';

const VideoCaptureBisBis = () => {
  const videoRef = useRef(null); // Pour l'élément vidéo web
  const canvasRef = useRef(null); // Pour traiter les images avec jsQR
  const [materiel, setMateriel] = useState(null);
  const [isQRCodeDetected, setIsQRCodeDetected] = useState(false);
  const [noMatchingMaterial, setNoMatchingMaterial] = useState(false);
  const history = useHistory();
  const [streamError, setStreamError] = useState(false);
  const toast = useToast();
  const { selectedTeam, teamUUID, setSelectedTeam } = useTeam();
  const { isOpen, onClose } = useDisclosure();
  const { isOpen: isAssociationModalOpen, onOpen: onAssociationModalOpen, onClose: onAssociationModalClose } = useDisclosure();

  const isNativeApp = Capacitor.isNativePlatform();

  // Fonction pour valider le format UUID
  const isValidUUID = (id) => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  // Fonction pour associer le matériel à une équipe
  const associateMaterialToTeam = useCallback(async (materialId) => {
    if (!teamUUID) {
      console.error("No team selected.");
      toast({
        title: "Erreur",
        description: "Aucune équipe sélectionnée pour associer le matériel.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('vianney_inventaire_materiel')
        .update({ associated_team_id: teamUUID })
        .eq('id', materialId)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      console.log('Matériel associé à l\'équipe avec succès', data);
      toast({
        title: "Succès",
        description: `Le matériel a été associé à l'équipe "${selectedTeam}" avec succès.`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      setMateriel(data);
      setNoMatchingMaterial(false);
    } catch (error) {
      console.error('Erreur lors de l\'association du matériel à l\'équipe', error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de l'association du matériel à l'équipe.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  }, [teamUUID, selectedTeam, toast]);

  // Fonction pour récupérer le matériel depuis la base de données
  const fetchMateriel = useCallback(async (id) => {
    try {
      if (!isValidUUID(id)) {
        setNoMatchingMaterial(true);
        return false;
      }

      const { data, error } = await supabase
        .from("vianney_inventaire_materiel")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        setNoMatchingMaterial(true);
        return false;
      } else {
        setMateriel(data);
        setNoMatchingMaterial(false);
        return true;
      }
    } catch (error) {
      console.error("Error fetching item details:", error);
      setNoMatchingMaterial(true);
      return false;
    }
  }, []);

  // Fonction pour traiter les données du QR code
  const processQR = useCallback(async (imageData, width, height) => {
    const code = jsQR(imageData.data, width, height, {
      inversionAttempts: "dontInvert",
    });

    if (code) {
      console.log("QR Code détecté :", code.data);
      const isValid = await fetchMateriel(code.data);
      if (isValid) {
        await associateMaterialToTeam(code.data);
        setIsQRCodeDetected(true);
        return true; // QR code valide détecté
      } else {
        console.log("QR Code invalide ou matériel non trouvé.");
        // Afficher un toast ou un message d'erreur
        toast({
          title: "QR Code invalide",
          description: "Le QR code scanné ne correspond à aucun matériel valide.",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
        return false; // QR code invalide, continuer le scan
      }
    }
    return false; // Aucun QR code détecté, continuer le scan
  }, [fetchMateriel, associateMaterialToTeam, toast]);

  // Fonction pour scanner les QR codes sur le web
  const scanQRCodeWeb = useCallback(
    (stream) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      const checkQRCode = () => {
        if (
          videoRef.current &&
          videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
        ) {
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          processQR(imageData, imageData.width, imageData.height).then((detected) => {
            if (detected) {
              console.log("QR Code valide détecté, arrêt du flux.");
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            // Continuer le scan
            requestAnimationFrame(checkQRCode);
          });
        } else {
          requestAnimationFrame(checkQRCode);
        }
      };

      // Ajouter un délai avant de commencer le scan pour éviter les faux positifs immédiats
      setTimeout(() => {
        console.log("Début du scan QR code après délai.");
        checkQRCode();
      }, 500); // Délai de 1 seconde
    },
    [processQR]
  );

  // Fonction pour scanner les QR codes sur les plateformes natives
  const scanQRCodeNative = useCallback(async () => {
    try {
      const interval = setInterval(async () => {
        try {
          const result = await CameraPreview.capture({
            quality: 90,
          });
          const img = new Image();
          img.src = `data:image/jpeg;base64,${result.value}`;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            processQR(imageData, imageData.width, imageData.height).then((detected) => {
              if (detected) {
                clearInterval(interval);
                CameraPreview.stop();
              }
            });
          };
        } catch (error) {
          console.error("Error capturing frame for QR code scanning:", error);
        }
      }, 1000); // Capture toutes les secondes
    } catch (err) {
      console.error("Error during native QR code scanning:", err);
      setStreamError(true);
    }
  }, [processQR]);

  // Fonction pour gérer les erreurs de flux vidéo
  const handleStreamError = (err) => {
    setStreamError(true);
    
    const errorMessages = {
      'OverconstrainedError': "Impossible d'accéder à la caméra avec les contraintes spécifiées. Essayez de changer de caméra.",
      'NotAllowedError': "Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur.",
      'default': "Impossible d'accéder à la caméra. Vérifiez les permissions ou réessayez."
    };

    toast({
      title: "Erreur d'accès à la caméra",
      description: errorMessages[err.name] || errorMessages['default'],
      status: "error",
      duration: 5000,
      isClosable: true,
    });
  };

  // Fonction pour activer le flux vidéo
  const enableStream = useCallback(async () => {
    if (isNativeApp) {
      try {
        await CameraPreview.start({
          position: 'rear',
          toBack: false,
          width: window.innerWidth,
          height: window.innerHeight,
          parent: 'cameraPreview', // Assurez-vous que l'ID correspond dans le rendu
          tapPhoto: false,
          previewDrag: false,
          storeToGallery: false,
        });
        scanQRCodeNative();
        toast({
          title: "Camera",
          description: "Caméra native activée et en cours de scan.",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
        setStreamError(false);
      } catch (err) {
        console.error('Erreur lors de l\'accès à la caméra sur la plateforme native', err);
        setStreamError(true);
        toast({
          title: "Erreur de caméra",
          description: "Impossible d'accéder à la caméra.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    } else {
      try {
        const constraints = {
          video: { 
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play()
              .then(() => {
                console.log("Video stream started successfully.");
                toast({
                  title: "Succès",
                  description: "Flux vidéo démarré avec succès.",
                  status: "success",
                  duration: 3000,
                  isClosable: true,
                });
                scanQRCodeWeb(stream);
                setStreamError(false);
              })
              .catch((playErr) => {
                console.error("Error playing video stream:", playErr);
                handleStreamError(playErr);
              });
          };

          videoRef.current.onerror = (e) => {
            console.error("Video element error:", e);
            handleStreamError(e);
          };
        }
      } catch (err) {
        console.error("Erreur lors de l'accès à la caméra :", err);
        handleStreamError(err);
      }
    }
    // eslint-disable-next-line
  }, [isNativeApp, scanQRCodeNative, scanQRCodeWeb, toast]);

  // Fonction pour réessayer d'accéder à la caméra
  const handleRetryAccess = async () => {
    await enableStream();
  };

  // Activer le flux vidéo au montage du composant
  useEffect(() => {
    enableStream();

    return () => {
      if (isNativeApp) {
        CameraPreview.stop();
      } else {
        if (videoRef.current && videoRef.current.srcObject) {
                  // eslint-disable-next-line
          let tracks = videoRef.current.srcObject.getTracks();
          tracks.forEach((track) => track.stop());
        }
      }
    };
  }, [enableStream, isNativeApp]);

  // Fonction pour scanner un nouveau QR code
  const handleScanNewQRCode = () => {
    setIsQRCodeDetected(false);
    setMateriel(null);
    enableStream();
  };

  // Vérifier si une équipe est sélectionnée
  useEffect(() => {
    if (!teamUUID) {
      toast({
        title: "Attention",
        description: "Veuillez sélectionner une équipe avant de scanner un matériel.",
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
      history.push("/admin/materiels"); // Rediriger vers la page des matériels
    }
  }, [teamUUID, toast, history]);

  // États pour les matériels, événements, équipes, etc.
  const [materiels, setMateriels] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [events, setEvents] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [selectedEvent, setSelectedEvent] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [loadingEvents, setLoadingEvents] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [loadingMateriels, setLoadingMateriels] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const { selectedEventId } = useEvent();
  const [selectedEventName, setSelectedEventName] = useState('');

  // Récupérer les événements
  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('vianney_event')
        .select('*');
      if (error) {
        console.error('Erreur lors de la récupération des événements', error);
      } else {
        setEvents(data);
        // Trouver le nom de l'événement actuellement sélectionné
        const currentEvent = data.find(event => event.event_id === selectedEventId);
        if (currentEvent) setSelectedEventName(currentEvent.event_name);
      }
      setLoadingEvents(false);
    };

    fetchEvents();
  }, [selectedEventId]);

  // Récupérer les équipes associées à l'événement sélectionné
  useEffect(() => {
    const fetchTeams = async () => {
      if (!selectedEventId) return; // Utiliser selectedEventId ici
      setLoadingTeams(true);
      const { data, error } = await supabase
        .from('vianney_teams')
        .select('*')
        .eq('event_id', selectedEventId); // Correction pour utiliser selectedEventId

      if (error) {
        console.error('Erreur lors de la récupération des équipes', error);
        setTeams([]); // S'assurer que les équipes sont réinitialisées en cas d'erreur
      } else {
        setTeams(data);
      }
      setLoadingTeams(false);
    };

    fetchTeams();
  }, [selectedEventId]);

  // Affichage de l'événement sélectionné
  const eventDisplay = selectedEventName ? (
    <Badge colorScheme="blue" p="2">
      {selectedEventName} (Sélectionné)
    </Badge>
  ) : (
    <Text>Chargement de l'événement...</Text>
  );

  // Charger les matériels et les équipes associées
  useEffect(() => {
    const chargerMateriels = async () => {
      const { data: materielsData, error: materielsError } = await supabase.from('vianney_inventaire_materiel').select('*');
      if (materielsError) {
        console.error('Erreur lors de la récupération des matériels', materielsError);
      } else {
        // Récupérer également les données des équipes associées
        const { data: teamsData, error: teamsError } = await supabase.from('vianney_teams').select('*');
        if (teamsError) {
          console.error('Erreur lors de la récupération des équipes', teamsError);
        } else {
          // Mettre à jour les données des matériels avec les noms des équipes associées
          const updatedMateriels = materielsData.map(materiel => {
            const associatedTeam = teamsData.find(team => team.id === materiel.associated_team_id);
            return {
              ...materiel,
              associated_team_name: associatedTeam ? associatedTeam.name_of_the_team : 'Aucune équipe associée'
            };
          });
          setMateriels(updatedMateriels);
        }
      }
      setLoading(false);
    };

    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('vianney_event')
        .select('*');
      if (error) console.error('Erreur lors de la récupération des événements', error);
      else setEvents(data);
      setLoadingEvents(false);
    };

    const fetchMateriels = async () => {
      const { data, error } = await supabase.from('vianney_inventaire_materiel').select('*');
      if (error) {
        console.error('Erreur lors de la récupération des matériels', error);
      } else {
        setMateriels(data);
      }
      setLoadingMateriels(false);
    };

    chargerMateriels();
    fetchEvents();
    fetchMateriels();
  }, [selectedEvent, setEvents, setLoadingEvents, setLoadingMateriels]);

  // Ouvrir le modal d'association
  const handleOpenAssociationModal = (materiel) => {
    setSelectedMaterial(materiel); // Sélectionner le matériel
    onAssociationModalOpen(); // Ouvrir le modal
  };

  // Supprimer un matériel
  const handleDelete = async () => {
    if (confirmDeleteId) {
      const { error } = await supabase.from('vianney_inventaire_materiel').delete().match({ id: confirmDeleteId });
      if (error) {
        console.error('Erreur lors de la suppression du matériel', error);
      } else {
        // Mettre à jour l'état local pour refléter la suppression
        setMateriels(materiels.filter(materiel => materiel.id !== confirmDeleteId));
        onClose(); // Fermer le modal de confirmation
        setConfirmDeleteId(null); // Réinitialiser l'ID de confirmation
        // Afficher un toast de succès
        toast({
          title: "Matériel supprimé avec succès",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
    }
  };

  // Rendre le matériel
  const handleReturnMaterial = async (id) => {
    const updatedMateriels = materiels.map(materiel => {
      if (materiel.id === id) {
        return { ...materiel, associated_team_id: null, associated_team_name: 'Aucune équipe associée' };
      }
      return materiel;
    });
    setMateriels(updatedMateriels);

    // Mettre à jour la base de données
    const { error } = await supabase.from('vianney_inventaire_materiel').update({ associated_team_id: null }).match({ id });
    if (error) {
      console.error('Erreur lors de la mise à jour du matériel', error);
    } else {
      // Afficher un toast de succès
      toast({
        title: "Matériel rendu avec succès",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Changer d'équipe
  const handleTeamChange = (e) => {
    const teamId = e.target.value;
    const team = teams.find(t => t.id.toString() === teamId);
    setSelectedTeam(team);
  };

  // Associer le matériel à l'équipe
  const handleAssociation = async () => {
    if (!selectedMaterial || !selectedTeam) return;

    const { data, error } = await supabase
      .from('vianney_inventaire_materiel')
      .update({ associated_team_id: selectedTeam.id })
      .eq('id', selectedMaterial.id);

    if (error) {
      console.error('Erreur lors de l\'association du matériel à l\'équipe', error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de l'association du matériel à l'équipe.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } else {
      console.log('Matériel associé à l\'équipe avec succès', data);
      toast({
        title: "Succès",
        description: `Le matériel "${selectedMaterial.nom}" a été associé à l'équipe "${selectedTeam.name_of_the_team}" avec succès.`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Box
      pt={{ base: "180px", md: "80px", xl: "80px" }}
      alignItems="center"
      justifyContent="center"
      display="flex"
      flexDirection="column"
    >
      {/* Bouton pour revenir aux matériels */}
      <Button onClick={() => history.push('/admin/materiels')} colorScheme="blue" mb={4}>
        Retour vers matériel
      </Button>

      {/* Canvas caché pour le scan QR code sur le web */}
      {!isNativeApp && (
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      )}

      {/* Afficher le scanner */}
      {!isQRCodeDetected && !streamError && (
        <Box width="100%" position="relative" borderRadius="10px">
          {isNativeApp ? (
            <div id="cameraPreview" style={{ width: '100%', height: '100%' }}></div>
          ) : (
            <div style={{ position: "relative", width: "100%", borderRadius: "10px" }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", borderRadius: "10px" }}
                onError={(e) => {
                  console.error("Video element error:", e);
                  setStreamError(true);
                  toast({
                    title: "Erreur",
                    description: "Impossible de lire le flux vidéo de la caméra.",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                  });
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "25%",
                  left: "25%",
                  width: "50%",
                  height: "50%",
                  border: "2px solid #00ff00",
                  borderRadius: "10px",
                }}
              ></div>
            </div>
          )}
        </Box>
      )}

      {/* Bouton pour démarrer le scan si nécessaire (optionnel, déjà démarré automatiquement) */}
      {!isQRCodeDetected && !isNativeApp && (
        <Button onClick={enableStream} colorScheme="green" mt={4}>
          Lancer le scan QR Code
        </Button>
      )}

      {materiel && (
        <Box alignItems="center" display="flex" flexDirection="column" justifyContent="center">
          <Box padding="4" maxW="500px" >
            <Box key={materiel.id} p="4" shadow="md" borderWidth="1px" borderRadius="md" bg="white">
              <VStack spacing="4">
                <Badge colorScheme="orange">{materiel.nom}</Badge>
                <Alert status={materiel.associated_team_id ? "success" : "warning"} variant="left-accent">
                  <AlertIcon />
                  {materiel.associated_team_id
                    ? `Le matériel "${materiel.nom}" est associé à l'équipe "${selectedTeam ? selectedTeam.name_of_the_team : 'Inconnue'}"`
                    : `Aucune équipe n'est associée au matériel "${materiel.nom}". Matériel libre.`}
                </Alert>
                <QRCode value={materiel.id} size={128} level="L" includeMargin={true} />
                {materiel.description && (
                  <Alert status="info" variant="left-accent">
                    <AlertIcon />
                    {materiel.description}
                  </Alert>
                )}
                <HStack spacing="4">
                  <Tooltip label="Associer à une autre équipe" hasArrow>
                    <IconButton
                      aria-label="Associer à une autre équipe"
                      icon={<FcOk />}
                      colorScheme="gray"
                      onClick={() => handleOpenAssociationModal(materiel)}
                    />
                  </Tooltip>
                  <Tooltip label="Rendre le matériel" hasArrow>
                    <IconButton
                      aria-label="Rendre le matériel"
                      icon={<FcDisclaimer />}
                      colorScheme="gray"
                      onClick={() => handleReturnMaterial(materiel.id)}
                    />
                  </Tooltip>
                </HStack>
              </VStack>
            </Box>
            {/* Bouton pour scanner un nouveau QR code */}
            {isQRCodeDetected && (
              <Button onClick={handleScanNewQRCode} colorScheme="green" mt={4}>
                Scanner nouveau QRCode
              </Button>
            )}
            {/* Modal de confirmation pour la suppression */}
            <Modal isOpen={isOpen} onClose={onClose}>
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Confirmation</ModalHeader>
                <ModalBody>
                  Voulez-vous vraiment supprimer ce matériel ?
                </ModalBody>
                <ModalFooter>
                  <Button colorScheme="red" onClick={handleDelete}>Oui, Supprimer</Button>
                  <Button ml="4" onClick={onClose}>Annuler</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>

            {/* Modal pour associer le matériel à une équipe */}
            <Modal isOpen={isAssociationModalOpen} onClose={onAssociationModalClose} size="xl">
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Associer à une équipe</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <VStack spacing={4} align="stretch">
                    {/* Afficher l'événement sélectionné */}
                    {eventDisplay}
                    {loadingTeams ? (
                      <Text>Chargement des équipes...</Text>
                    ) : (
                      <Select placeholder="Sélectionner une équipe" onChange={handleTeamChange}>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name_of_the_team}
                          </option>
                        ))}
                      </Select>
                    )}

                    {/* Afficher le matériel sélectionné */}
                    {selectedMaterial ? (
                      <Badge colorScheme="green" p="2">
                        {selectedMaterial.nom} (Sélectionné)
                      </Badge>
                    ) : (
                      <Select placeholder="Sélectionner un matériel" onChange={(e) => {
                        const selected = materiels.find(materiel => materiel.id.toString() === e.target.value);
                        setSelectedMaterial(selected);
                      }}>
                        {materiels.map((materiel) => (
                          <option key={materiel.id} value={materiel.id}>
                            {materiel.nom}
                          </option>
                        ))}
                      </Select>
                    )}

                    <Button onClick={handleAssociation}>Associer matériel à l'équipe</Button>
                  </VStack>
                </ModalBody>
              </ModalContent>
            </Modal>
          </Box>
        </Box>
      )}

      {noMatchingMaterial && (
        <Alert status="error">
          <AlertIcon />
          Aucun matériel correspondant trouvé. Ce QR code n'existe pas.
        </Alert>
      )}

      {streamError && (
        <VStack spacing={4} mt={4}>
          <Alert status="warning">
            <AlertIcon />
            Impossible de démarrer la caméra. Vérifiez les permissions ou
            réessayez.
          </Alert>
          <Button onClick={handleRetryAccess} colorScheme="blue">
            Réessayer d'accéder à la caméra
          </Button>
        </VStack>
      )}
    </Box>
  );
};

export default VideoCaptureBisBis;

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Camera, CheckCircle2, LoaderCircle, RotateCcw, Upload } from 'lucide-react';
import api, { getErrorMessage } from '../services/api';

export type FacePosition = 'front' | 'left' | 'right';
export type FaceImages = Partial<Record<FacePosition, File>>;
export type FaceValidation = Record<FacePosition, 'empty' | 'checking' | 'valid' | 'invalid'>;

export const emptyFaceValidation: FaceValidation = {
  front: 'empty',
  left: 'empty',
  right: 'empty',
};

const positions: { id: FacePosition; label: string; instruction: string }[] = [
  { id: 'front', label: 'Front image', instruction: 'Look straight at the camera.' },
  { id: 'left', label: 'Left-side image', instruction: 'Turn your face slightly to the left.' },
  { id: 'right', label: 'Right-side image', instruction: 'Turn your face slightly to the right.' },
];

interface Props {
  images: FaceImages;
  setImages: Dispatch<SetStateAction<FaceImages>>;
  validation: FaceValidation;
  setValidation: Dispatch<SetStateAction<FaceValidation>>;
  validateImages?: boolean;
}

export default function FaceCapturePanel({
  images,
  setImages,
  validation,
  setValidation,
  validateImages = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [position, setPosition] = useState<FacePosition>('front');
  const [cameraError, setCameraError] = useState('');
  const [previews, setPreviews] = useState<Partial<Record<FacePosition, string>>>({});

  useEffect(() => {
    const next: Partial<Record<FacePosition, string>> = {};
    for (const [key, file] of Object.entries(images) as [FacePosition, File][]) {
      next[key] = URL.createObjectURL(file);
    }
    setPreviews(next);
    return () => Object.values(next).forEach(URL.revokeObjectURL);
  }, [images]);

  useEffect(() => {
    if (!cameraOn) return;
    let active = true;
    let stream: MediaStream | undefined;
    setCameraError('');
    if (!window.isSecureContext) {
      setCameraError('Camera access requires HTTPS. Open the registration link on a secure dashboard address.');
      setCameraOn(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not support camera capture.');
      setCameraOn(false);
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((result) => {
        stream = result;
        if (active && videoRef.current) videoRef.current.srcObject = result;
        else result.getTracks().forEach((track) => track.stop());
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setCameraError('Camera permission was denied. Allow camera access in your browser settings and try again.');
        } else if (error instanceof DOMException && error.name === 'NotFoundError') {
          setCameraError('No camera was found on this device.');
        } else {
          setCameraError(error instanceof Error ? error.message : getErrorMessage(error));
        }
        setCameraOn(false);
      });
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOn]);

  const setImage = async (target: FacePosition, file: File | undefined) => {
    if (!file) return;
    setImages((current) => ({ ...current, [target]: file }));
    setValidation((current) => ({ ...current, [target]: validateImages ? 'checking' : 'valid' }));
    if (!validateImages) return;

    const form = new FormData();
    form.append('position', target);
    form.append('image', file);
    try {
      await api.post('/face/faces/validate', form);
      setValidation((current) => ({ ...current, [target]: 'valid' }));
      setCameraError('');
    } catch (error) {
      setValidation((current) => ({ ...current, [target]: 'invalid' }));
      setCameraError(getErrorMessage(error));
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError('Wait for the camera preview before capturing.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setCameraError('Could not capture an image. Please try again.');
      return;
    }
    await setImage(position, new File([blob], `${position}.jpg`, { type: 'image/jpeg' }));
  };

  const statusLabel = (target: FacePosition) => {
    if (validation[target] === 'checking') return 'Checking face…';
    if (validation[target] === 'invalid') return 'Needs a clearer single face';
    if (validation[target] === 'valid') return validateImages ? 'Face validated' : 'Preview ready';
    return 'Image required';
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {positions.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-200">{item.label}</span>
              {validation[item.id] === 'checking' ? (
                <LoaderCircle size={15} className="animate-spin text-sky-400" />
              ) : validation[item.id] === 'valid' ? (
                <CheckCircle2 size={15} className="text-emerald-400" />
              ) : null}
            </div>
            <p className="mb-3 text-xs text-slate-400">{item.instruction}</p>
            {previews[item.id] ? (
              <img src={previews[item.id]} alt={`${item.label} preview`} className="mb-3 aspect-video w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-3 flex aspect-video items-center justify-center rounded-lg bg-slate-800 text-xs text-slate-500">
                No image selected
              </div>
            )}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
              <Upload size={14} /> {images[item.id] ? 'Choose another image' : 'Upload image'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  void setImage(item.id, event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            <p className={`mt-2 text-[11px] ${validation[item.id] === 'invalid' ? 'text-rose-400' : 'text-slate-500'}`}>
              {statusLabel(item.id)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Capture with a camera</h4>
            <p className="text-xs text-slate-400">Capture one position at a time; you can retake any image.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => setCameraOn((current) => !current)}>
            <Camera size={15} /> {cameraOn ? 'Close camera' : 'Start camera'}
          </button>
        </div>
        {cameraError && <p role="alert" className="mt-3 text-xs text-rose-400">{cameraError}</p>}
        {cameraOn && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <video ref={videoRef} autoPlay muted playsInline className="max-h-72 w-full rounded-lg bg-black object-cover" />
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-slate-300">
                Image position
                <select className="input mt-1" value={position} onChange={(event) => setPosition(event.target.value as FacePosition)}>
                  {positions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <button type="button" className="btn-primary" onClick={() => void capture()}>
                {images[position] ? <RotateCcw size={15} /> : <Camera size={15} />}
                {images[position] ? 'Retake image' : 'Capture image'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

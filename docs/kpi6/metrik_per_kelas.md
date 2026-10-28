# Metrik per kelas VLM pada *test set* (n = 8)

Sumber: `results/vlm/evaluation/<eksperimen>/predictions.csv`, kolom `true_label` (anotasi manual) dibandingkan dengan kolom `label` (prediksi setelah aturan SCS). Specificity dihitung *one-vs-rest*: TN/(TN+FP). Komposisi *support*: 4 `stress`, 1 `not_stress`, 3 `undefined`. Versi mesin ada di `metrik_per_kelas.csv` (desimal titik, 4 angka di belakang koma).

## Tabel ringkas

| Model | Kelas | *Precision* | *Recall* | *Specificity* | F1 | *Support* |
|---|---|---|---|---|---|---|
| *Fine-tuned* VLM (SCS + LoRA) | *stress* | 1,00 | 1,00 | 1,00 | 1,00 | 4 |
| *Fine-tuned* VLM (SCS + LoRA) | *not stress* | 1,00 | 1,00 | 1,00 | 1,00 | 1 |
| *Fine-tuned* VLM (SCS + LoRA) | *undefined* | 1,00 | 1,00 | 1,00 | 1,00 | 3 |
| *Zero-shot* VLM (SCS) | *stress* | 0,00ᵃ | 0,00 | 1,00ᵇ | 0,00 | 4 |
| *Zero-shot* VLM (SCS) | *not stress* | 0,00 | 0,00 | 0,57 | 0,00 | 1 |
| *Zero-shot* VLM (SCS) | *undefined* | 0,60 | 1,00 | 0,60 | 0,75 | 3 |

| Model | *Accuracy* | *Macro*-F1 |
|---|---|---|
| *Fine-tuned* VLM (SCS + LoRA) | 1,000 | 1,000 |
| *Zero-shot* VLM (SCS) | 0,375 | 0,250 |

ᵃ Model *zero-shot* tidak pernah memprediksi *stress* (TP + FP = 0), sehingga *precision* secara matematis 0/0. Nilai 0,00 mengikuti konvensi `zero_division=0` yang juga dipakai `classification_report.txt`.
ᵇ *Specificity* 1,00 hanya karena tidak ada prediksi *stress* sama sekali (FP = 0), bukan karena model mampu membedakan kelas.

## *Confusion matrix* (baris = label sebenarnya, kolom = prediksi)

*Fine-tuned* VLM (SCS + LoRA):

| Sebenarnya \ Prediksi | stress | not_stress | undefined | Total |
|---|---|---|---|---|
| stress | 4 | 0 | 0 | 4 |
| not_stress | 0 | 1 | 0 | 1 |
| undefined | 0 | 0 | 3 | 3 |
| Total prediksi | 4 | 1 | 3 | 8 |

*Zero-shot* VLM (SCS):

| Sebenarnya \ Prediksi | stress | not_stress | undefined | Total |
|---|---|---|---|---|
| stress | 0 | 3 | 1 | 4 |
| not_stress | 0 | 0 | 1 | 1 |
| undefined | 0 | 0 | 3 | 3 |
| Total prediksi | 0 | 3 | 5 | 8 |

## Komponen TP/FP/FN/TN *zero-shot* (*one-vs-rest*)

| Kelas | TP | FP | FN | TN | Perhitungan |
|---|---|---|---|---|---|
| *stress* | 0 | 0 | 4 | 4 | P = 0/0 → 0; R = 0/4; Spec = 4/4; F1 = 0 |
| *not stress* | 0 | 3 | 1 | 4 | P = 0/3; R = 0/1; Spec = 4/7 = 0,5714; F1 = 0 |
| *undefined* | 3 | 2 | 0 | 3 | P = 3/5; R = 3/3; Spec = 3/5; F1 = 6/8 = 0,75 |

*Accuracy* = (0 + 0 + 3)/8 = 0,375. *Macro*-F1 = (0 + 0 + 0,75)/3 = 0,250.

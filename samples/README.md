# Sample scans

De-identified images from public research datasets, used by `make seed` and handy for trying the
app. They are not for clinical use.

| File | Source | Label | License |
| --- | --- | --- | --- |
| `brain-mri-glioma.jpg` | Brain Tumor MRI Dataset, `Testing/glioma/Te-gl_10.jpg` | Glioma | CC BY 4.0 |
| `brain-mri-glioma-2.jpg` | Brain Tumor MRI Dataset, `Testing/glioma/Te-gl_23.jpg` | Glioma | CC BY 4.0 |
| `brain-mri-glioma-3.jpg` | Brain Tumor MRI Dataset, `Testing/glioma/Te-gl_41.jpg` | Glioma | CC BY 4.0 |
| `brain-mri-glioma-4.jpg` | Brain Tumor MRI Dataset, `Testing/glioma/Te-gl_68.jpg` | Glioma (the model says meningioma) | CC BY 4.0 |
| `brain-mri-meningioma-1.jpg` | Brain Tumor MRI Dataset, `Testing/meningioma/Te-me_10.jpg` | Meningioma | CC BY 4.0 |
| `brain-mri-meningioma-2.jpg` | Brain Tumor MRI Dataset, `Testing/meningioma/Te-me_102.jpg` | Meningioma | CC BY 4.0 |
| `brain-mri-pituitary-1.jpg` | Brain Tumor MRI Dataset, `Testing/pituitary/Te-pi_12.jpg` | Pituitary tumor | CC BY 4.0 |
| `brain-mri-pituitary-2.jpg` | Brain Tumor MRI Dataset, `Testing/pituitary/Te-pi_41.jpg` | Pituitary tumor | CC BY 4.0 |
| `brain-mri-no-tumor.jpg` | Brain Tumor MRI Dataset, `Testing/notumor/Te-no_10.jpg` | No tumor | CC BY 4.0 |
| `brain-mri-no-tumor-2.jpg` | Brain Tumor MRI Dataset, `Testing/notumor/Te-no_41.jpg` | No tumor | CC BY 4.0 |
| `chest-xray-normal.png` | Chest X-Ray Images (Pneumonia), `val/NORMAL/NORMAL2-IM-1427-0001.jpeg` | Normal | CC BY 4.0 |
| `chest-xray-normal-2.png` | Chest X-Ray Images (Pneumonia), `val/NORMAL/NORMAL2-IM-1430-0001.jpeg` | Normal | CC BY 4.0 |
| `chest-xray-normal-3.png` | Chest X-Ray Images (Pneumonia), `val/NORMAL/NORMAL2-IM-1438-0001.jpeg` | Normal | CC BY 4.0 |
| `chest-xray-normal-4.png` | Chest X-Ray Images (Pneumonia), `val/NORMAL/NORMAL2-IM-1442-0001.jpeg` | Normal | CC BY 4.0 |
| `chest-xray-normal-5.png` | Chest X-Ray Images (Pneumonia), `val/NORMAL/NORMAL2-IM-1437-0001.jpeg` | Normal (the model says pneumonia) | CC BY 4.0 |
| `chest-xray-pneumonia.png` | Chest X-Ray Images (Pneumonia), `val/PNEUMONIA/person1946_bacteria_4874.jpeg` | Pneumonia | CC BY 4.0 |
| `chest-xray-pneumonia-2.png` | Chest X-Ray Images (Pneumonia), `val/PNEUMONIA/person1946_bacteria_4875.jpeg` | Pneumonia | CC BY 4.0 |
| `chest-xray-pneumonia-3.png` | Chest X-Ray Images (Pneumonia), `val/PNEUMONIA/person1951_bacteria_4882.jpeg` | Pneumonia | CC BY 4.0 |
| `chest-xray-pneumonia-4.png` | Chest X-Ray Images (Pneumonia), `val/PNEUMONIA/person1949_bacteria_4880.jpeg` | Pneumonia | CC BY 4.0 |

Two images are deliberately ones the models get wrong, so the demo can show a radiologist
overriding the AI.

## Attribution

- **Brain Tumor MRI Dataset**, Masoud Nickparvar (Kaggle), combining figshare, SARTAJ and Br35H.
  Mirrored at [BJyotibrat/Masoud-Nickparvar-Brain-Tumor-MRI-Dataset](https://huggingface.co/datasets/BJyotibrat/Masoud-Nickparvar-Brain-Tumor-MRI-Dataset).
  License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Chest X-Ray Images (Pneumonia)**, Kermany, Zhang and Goldbaum,
  [Mendeley Data v2](https://data.mendeley.com/datasets/rscbjbr9sj/2), doi:10.17632/rscbjbr9sj.2.
  The images were resized to 256×256 grayscale in
  [Purino/chest-xray-pneumonia-256-fullframe-gray](https://huggingface.co/datasets/Purino/chest-xray-pneumonia-256-fullframe-gray).
  License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The files are unmodified copies of the images above.

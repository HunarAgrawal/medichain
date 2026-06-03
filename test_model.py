# test_model.py (Corrected)

from transformers import AutoImageProcessor, AutoModelForImageClassification

print("--- Starting Model Load Test ---")
print("Attempting to load Brain Tumor model (facebook/convnext-tiny-224)...")

try:
    model_name = "facebook/convnext-tiny-224"
    # CORRECTED: The class is AutoImageProcessor, not AutoImagePreProcessor
    processor = AutoImageProcessor.from_pretrained(model_name)
    model = AutoModelForImageClassification.from_pretrained(model_name)
    print("\n✅ SUCCESS: Brain Tumor model loaded successfully!")

except Exception as e:
    print(f"\n❌ FAILED: An error occurred: {e}")

print("--- Test Complete ---")
"""The nine classifier labels and the dataset class-id mappings that feed them."""

LABELS: tuple[str, ...] = (
    "top", "outerwear", "trousers", "shorts", "skirt", "dress", "shoes", "hat", "bag",
)

# DeepFashion2 category id -> label.
DF2_CATEGORY_TO_LABEL: dict[int, str] = {
    1: "top", 2: "top", 5: "top", 6: "top",
    3: "outerwear", 4: "outerwear",
    7: "shorts", 8: "trousers", 9: "skirt",
    10: "dress", 11: "dress", 12: "dress", 13: "dress",
}

# Multimodal fashion dataset class id -> label (footwear, headwear, bag).
MM_CLASS_TO_LABEL: dict[int, str] = {11: "shoes", 7: "hat", 12: "bag"}

# Clothing dataset (Grigorev) label -> label. "Hoodie" is sorted image by image in
# clothing_overrides.csv (pullover -> top, zip-up -> outerwear); "Body", "Not sure", "Other"
# and "Skip" are dropped.
CLOTHING_LABEL_TO_LABEL: dict[str, str] = {
    "T-Shirt": "top", "Longsleeve": "top", "Shirt": "top", "Polo": "top",
    "Top": "top", "Blouse": "top", "Undershirt": "top",
    "Outwear": "outerwear", "Blazer": "outerwear",
    "Pants": "trousers", "Shorts": "shorts", "Skirt": "skirt", "Dress": "dress",
    "Shoes": "shoes", "Hat": "hat",
}


def label_index(label: str) -> int:
    return LABELS.index(label)

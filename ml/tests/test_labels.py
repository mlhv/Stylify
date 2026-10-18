from stylify_ml.labels import DF2_CATEGORY_TO_LABEL, LABELS, MM_CLASS_TO_LABEL, label_index


def test_labels_in_output_order():
    assert LABELS == ("top", "outerwear", "trousers", "shorts", "skirt", "dress", "shoes", "hat", "bag")


def test_df2_mapping_covers_all_13_categories():
    assert DF2_CATEGORY_TO_LABEL == {
        1: "top", 2: "top", 5: "top", 6: "top",          # short/long sleeve top, vest, sling
        3: "outerwear", 4: "outerwear",                    # short/long sleeve outwear
        7: "shorts", 8: "trousers", 9: "skirt",
        10: "dress", 11: "dress", 12: "dress", 13: "dress",
    }


def test_multimodal_mapping_uses_only_shoes_hat_bag():
    assert MM_CLASS_TO_LABEL == {11: "shoes", 7: "hat", 12: "bag"}  # footwear, headwear, bag


def test_label_index():
    assert label_index("top") == 0 and label_index("bag") == 8

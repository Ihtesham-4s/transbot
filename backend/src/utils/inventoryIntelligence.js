function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculateInventoryIntelligence(product = {}) {
  const currentStock = toNumber(product.currentStock);
  const minStock = toNumber(product.minStock);
  const maxStock = toNumber(product.maxStock, 100);

  if (currentStock <= minStock) {
    return {
      stockStatus: "LOW_STOCK",
      suggestedReorderQty: Math.max(maxStock - currentStock, 0),
      riskLevel: "HIGH"
    };
  }

  if (currentStock >= maxStock) {
    return {
      stockStatus: "OVERSTOCK",
      suggestedReorderQty: 0,
      riskLevel: "MEDIUM"
    };
  }

  return {
    stockStatus: "NORMAL",
    suggestedReorderQty: 0,
    riskLevel: "LOW"
  };
}

export function serializeProductWithIntelligence(product) {
  const json =
    product && typeof product.toJSON === "function"
      ? product.toJSON()
      : {
          ...product,
          id: product?._id ? String(product._id) : product?.id
        };

  delete json._id;
  delete json.__v;

  return {
    ...json,
    ...calculateInventoryIntelligence(json)
  };
}

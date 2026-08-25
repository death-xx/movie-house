import React, { useState } from "react";
import { X, Trash2, CheckCircle, ArrowRight, Shield, HardDrive, Film, Tv } from "lucide-react";
import { CartItem } from "../../types";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onRemoveItem: (videoId: string) => void;
  onCheckout: (name: string, phone: string) => Promise<boolean>;
  onClearCart: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  onRemoveItem,
  onCheckout,
  onClearCart,
}) => {
  const [customerName, setCustomerName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  if (!isOpen) return null;

  const totalKs = cart.reduce((acc, item) => acc + item.price_ks, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || cart.length === 0) return;

    setSubmitError("");
    setIsSubmitting(true);
    const success = await onCheckout(customerName, "");
    setIsSubmitting(false);

    if (success) {
      setOrderSuccess(true);
      onClearCart();
    } else {
      setSubmitError("Could not send your list. Check the local Wi-Fi connection and try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="bg-zinc-900 border-l border-zinc-800 w-full max-w-md h-full flex flex-col justify-between shadow-2xl p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="font-bold text-white text-base">Selected Movies & Series</h3>
            <p className="text-xs text-zinc-400">Hand phone/USB to desk for 1-Click Copy</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {orderSuccess ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h4 className="font-bold text-white text-lg">Order Transmitted to Desk!</h4>
            <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
              Your movie selections are now flashing on the store keeper's screen.
              <br />
              <strong className="text-white">Please give your phone / USB drive to the counter for fast 1-click copy.</strong>
            </p>
            <button
              onClick={() => {
                setOrderSuccess(false);
                onClose();
              }}
              className="mt-4 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl"
            >
              Choose More Titles
            </button>
          </div>
        ) : cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
            <HardDrive className="w-10 h-10 mb-2 stroke-[1.2] text-zinc-700" />
            <p className="text-sm font-medium">Your movie selection list is empty.</p>
            <p className="text-xs text-zinc-600 mt-1">Tap "Add to List" on any movie or series episode.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto my-4 space-y-2.5 pr-1">
            {cart.map((item) => (
              <div
                key={item.video.id}
                className="p-3 bg-zinc-800/80 border border-zinc-700/60 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5">
                  {item.video.content_type === "series" ? (
                    <Tv className="w-4 h-4 text-purple-400 shrink-0" />
                  ) : (
                    <Film className="w-4 h-4 text-indigo-400 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-white text-xs line-clamp-1">
                      {item.video.title}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {item.video.content_type === "series" ? "Series Episode" : "Full Movie"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-emerald-400 font-mono font-bold text-xs">
                    {item.price_ks} Ks
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.video.id)}
                    className="p-1 text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer Checkout Form */}
        {!orderSuccess && cart.length > 0 && (
          <form onSubmit={handleSubmit} className="pt-4 border-t border-zinc-800 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Your Name / Device Identifier
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Alex (Red iPhone)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-zinc-400 font-medium">Total Cost:</span>
              <span className="text-lg font-bold font-mono text-emerald-400">
                {totalKs} Ks
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:bg-zinc-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-950"
            >
              {isSubmitting ? "Transmitting..." : "Send List to Store Counter"}
              <ArrowRight className="w-4 h-4" />
            </button>

            {submitError && <p className="text-center text-[11px] text-rose-400">{submitError}</p>}

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Offline WiFi connection • Hand phone to counter for 1-click copy</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const FeePage = {
  template: `
  <div class="bg-gray-50 min-h-screen p-4">
    <div class="max-w-6xl mx-auto space-y-4">

      <!-- Header -->
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Fee Collection</h1>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <!-- Left section -->
        <section class="lg:col-span-2 bg-white rounded-2xl shadow p-4 space-y-4">

          <!-- Student info -->
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">
              {{ student.initials }}
            </div>
            <div>
              <div class="font-semibold text-lg">{{ student.name }}</div>
              <div class="text-sm text-gray-500">ID: {{ student.id }}</div>
              <div class="text-sm text-gray-500">Class: {{ student.class }}</div>
            </div>
          </div>

          <!-- Fee rows -->
          <div class="space-y-3">
            <div v-for="(item, i) in items" :key="i"
              class="flex items-center gap-2 bg-gray-50 rounded-xl p-3">

              <input type="checkbox" v-model="item.active" />

              <input v-model="item.label"
                class="flex-1 px-3 py-2 rounded border text-sm" />

              <input type="number" v-model.number="item.qty"
                class="w-16 px-3 py-2 rounded border text-sm" min="1" />

              <input type="number" v-model.number="item.rate"
                class="w-24 px-3 py-2 rounded border text-sm" min="0" />

              <div class="w-24 text-right font-semibold text-gray-700">
                ₹ {{ item.qty * item.rate }}
              </div>

              <button @click="removeItem(i)"
                class="text-red-500 text-sm hover:underline">
                Remove
              </button>
            </div>

            <button @click="addItem" class="text-indigo-600 text-sm hover:underline">
              + Add Fee Item
            </button>
          </div>

          <!-- Scholarship & Adjustments -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div>
              <label class="text-sm text-gray-600">Scholarship</label>
              <input type="number" v-model.number="scholarship"
                class="mt-1 w-full px-3 py-2 rounded border text-sm" min="0" />
            </div>

            <div>
              <label class="text-sm text-gray-600">Adjustment</label>
              <input type="number" v-model.number="adjustment"
                class="mt-1 w-full px-3 py-2 rounded border text-sm" />
            </div>
          </div>

        </section>

        <!-- Summary -->
        <aside class="bg-white rounded-2xl shadow p-4 space-y-4">
          <h2 class="text-lg font-semibold">Summary</h2>

          <div class="flex items-center justify-between">
            <span class="text-gray-600">Total Amount</span>
            <span class="text-2xl font-bold">₹ {{ totalAmount }}</span>
          </div>

          <!-- Submit -->
          <button @click="openConfirm = true"
            class="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
            Proceed to Pay
          </button>
        </aside>
      </div>

      <!-- Modal -->
      <div v-if="openConfirm"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

        <div class="bg-white rounded-xl p-4 w-full max-w-sm">
          <h3 class="text-lg font-semibold">Confirm Payment</h3>
          <p class="text-sm text-gray-600 mt-2">
            You are about to collect <strong>₹ {{ totalAmount }}</strong>.
          </p>

          <div class="flex justify-end gap-2 mt-4">
            <button @click="openConfirm = false"
              class="px-3 py-2 border rounded">Cancel</button>

            <button @click="submitPayment"
              class="px-3 py-2 bg-green-600 text-white rounded">
              Confirm & Pay
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
  `,

  data() {
    return {
      student: {
        name: "Jatin Sharma",
        id: "STU-10234",
        class: "8th - B",
        get initials() {
          return this.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase();
        },
      },

      items: [
        { active: true, label: "Tuition Fee", qty: 1, rate: 5000 },
        { active: true, label: "Transport Fee", qty: 1, rate: 1200 },
      ],

      scholarship: 0,
      adjustment: 0,
      openConfirm: false,
    };
  },

  computed: {
    totalAmount() {
      const total = this.items
        .filter((i) => i.active)
        .reduce((s, i) => s + i.qty * i.rate, 0);

      return Math.max(0, total - this.scholarship + this.adjustment);
    },
  },

  methods: {
    addItem() {
      this.items.push({
        active: true,
        label: "New Fee",
        qty: 1,
        rate: 0,
      });
    },

    removeItem(i) {
      this.items.splice(i, 1);
    },

    submitPayment() {
      this.openConfirm = false;
      alert("Payment started: ₹" + this.totalAmount);
    },
  },
};

Vue.createApp(FeePage).mount("#app");

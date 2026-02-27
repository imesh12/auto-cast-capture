const express = require("express");
const admin = require("firebase-admin");
const Stripe = require("stripe");
const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_KEY);

const firestore = admin.firestore();

// CREATE CHECKOUT
router.post("/create-checkout", async(req,res)=>{
  try{
    const { cameraId } = req.body;
    const uid = req.user.uid;

    // get user profile
    const userSnap = await firestore.doc(`users/${uid}`).get();
    const { clientId } = userSnap.data();

    const camRef = firestore.doc(`clients/${clientId}/cameras/${cameraId}`);
    const snap = await camRef.get();
    if(!snap.exists) return res.status(404).send("Camera not found");

    const camera = snap.data();

    const session = await stripe.checkout.sessions.create({
      mode:"subscription",
      customer_email: userSnap.data().email,
      line_items:[
        {
          price: process.env.STRIPE_PRICE_CAMERA,
          quantity:1,
        }
      ],
      success_url:`${process.env.BASE_URL}/payment-success?cameraId=${cameraId}`,
      cancel_url:`${process.env.BASE_URL}/payment-cancel`,
    });

    return res.json({ url: session.url });

  }catch(err){
    console.error(err);
    res.status(500).send("error");
  }
});

module.exports = router;

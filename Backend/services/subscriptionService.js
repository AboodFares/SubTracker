const Subscription = require('../models/Subscription');

/**
 * Finds an existing subscription by user and company name
 * @param {string} userId - User ID
 * @param {string} companyName - Company/service name
 * @returns {Promise<Object|null>} Existing subscription or null
 */
async function findExistingSubscription(userId, companyName) {
  try {
    // Extract the base brand name (first word or known brand)
    // This handles cases like "Crave" matching "Crave Standard With Ads"
    const baseName = companyName.trim().split(/\s+/)[0];
    const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const subscription = await Subscription.findOne({
      userId: userId,
      companyName: { $regex: new RegExp(escapedBase, 'i') } // Fuzzy match on base brand name
    }).sort({ updatedAt: -1 }); // Get the most recently updated one
    return subscription;
  } catch (error) {
    console.error('Error finding existing subscription:', error);
    throw error;
  }
}

/**
 * Creates a new subscription
 * @param {Object} data - Subscription data
 * @returns {Promise<Object>} Created subscription
 */
async function createSubscription(data) {
  try {
    const subscription = await Subscription.create({
      userId: data.userId,
      companyName: data.companyName,
      price: data.price,
      currency: data.currency,
      startDate: data.startDate,
      nextRenewalDate: data.nextRenewalDate,
      cancellationDate: data.cancellationDate,
      accessEndDate: data.accessEndDate,
      status: data.status || 'active',
      planName: data.planName,
      sourceEmailId: data.sourceEmailId,
      sourceEmailDate: data.sourceEmailDate
    });
    return subscription;
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
}

/**
 * Updates an existing subscription (for renewals and plan changes)
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated subscription
 */
async function updateSubscription(subscriptionId, updateData) {
  try {
    const setFields = {
      price: updateData.price,
      currency: updateData.currency,
      nextRenewalDate: updateData.nextRenewalDate,
      planName: updateData.planName,
      sourceEmailId: updateData.sourceEmailId,
      sourceEmailDate: updateData.sourceEmailDate
    };
    // Allow reactivating cancelled subscriptions on renewal
    if (updateData.status) setFields.status = updateData.status;
    if (updateData.cancellationDate !== undefined) setFields.cancellationDate = updateData.cancellationDate;
    if (updateData.accessEndDate !== undefined) setFields.accessEndDate = updateData.accessEndDate;

    const subscription = await Subscription.findByIdAndUpdate(
      subscriptionId,
      { $set: setFields },
      { new: true, runValidators: true }
    );
    return subscription;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
}

/**
 * Marks a subscription as cancelled
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} cancellationData - Cancellation data
 * @returns {Promise<Object>} Updated subscription
 */
async function cancelSubscription(subscriptionId, cancellationData) {
  try {
    const subscription = await Subscription.findByIdAndUpdate(
      subscriptionId,
      {
        $set: {
          status: 'cancelled',
          cancellationDate: cancellationData.cancellationDate,
          accessEndDate: cancellationData.accessEndDate,
          sourceEmailId: cancellationData.sourceEmailId,
          sourceEmailDate: cancellationData.sourceEmailDate
        }
      },
      { new: true, runValidators: true }
    );
    return subscription;
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    throw error;
  }
}

/**
 * Processes extracted subscription data and decides backend action
 * @param {string} userId - User ID
 * @param {Object} extractedData - AI-extracted data
 * @param {Object} emailInfo - Email metadata (id, date)
 * @returns {Promise<Object>} Created or updated subscription
 */
async function processSubscriptionData(userId, extractedData, emailInfo) {
  try {
    const { eventType, serviceName, amount, currency, startDate, nextBillingDate, cancellationDate, planName } = extractedData;

    // Parse dates - use email date as fallback instead of today's date
    const emailDate = emailInfo.date ? new Date(emailInfo.date) : new Date();
    const parsedStartDate = startDate ? new Date(startDate) : emailDate;
    const parsedNextRenewal = nextBillingDate ? new Date(nextBillingDate) : null;
    const parsedCancellationDate = cancellationDate ? new Date(cancellationDate) : null;

    // Find existing subscription
    const existingSubscription = await findExistingSubscription(userId, serviceName);

    // Skip if this email is OLDER than the one that last updated the subscription
    // This prevents older emails from overwriting newer data (Gmail returns newest first)
    // Exception: cancellation events use their own date check (cancellationDate vs sourceEmailDate)
    if (existingSubscription && existingSubscription.sourceEmailDate && emailDate && eventType !== 'cancellation') {
      const existingEmailDate = new Date(existingSubscription.sourceEmailDate);
      if (emailDate < existingEmailDate) {
        // Older email — don't overwrite, just return existing subscription
        return existingSubscription;
      }
    }

    switch (eventType) {
      case 'start':
        // Create new subscription
        if (existingSubscription) {
          // If subscription already exists, update it instead
          const startUpdate = {
            price: amount || existingSubscription.price,
            currency: currency || existingSubscription.currency,
            nextRenewalDate: parsedNextRenewal,
            planName: planName,
            sourceEmailId: emailInfo.id,
            sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
          };
          // A start event means the subscription is active — reactivate if cancelled
          if (existingSubscription.status === 'cancelled') {
            startUpdate.status = 'active';
            startUpdate.cancellationDate = null;
            startUpdate.accessEndDate = null;
          }
          return await updateSubscription(existingSubscription._id, startUpdate);
        }
        return await createSubscription({
          userId,
          companyName: serviceName,
          price: amount || 0,
          currency: currency || 'USD',
          startDate: parsedStartDate,
          nextRenewalDate: parsedNextRenewal,
          status: 'active',
          planName: planName,
          sourceEmailId: emailInfo.id,
          sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
        });

      case 'renewal':
        // Update existing subscription with renewal info
        if (existingSubscription) {
          const renewalUpdate = {
            price: amount || existingSubscription.price,
            currency: currency || existingSubscription.currency,
            nextRenewalDate: parsedNextRenewal,
            planName: planName || existingSubscription.planName,
            sourceEmailId: emailInfo.id,
            sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
          };
          // A renewal means the subscription is active — reactivate if cancelled
          if (existingSubscription.status === 'cancelled') {
            renewalUpdate.status = 'active';
            renewalUpdate.cancellationDate = null;
            renewalUpdate.accessEndDate = null;
          }
          return await updateSubscription(existingSubscription._id, renewalUpdate);
        }
        // If no existing subscription, create one (renewal email might be first email we see)
        return await createSubscription({
          userId,
          companyName: serviceName,
          price: amount || 0,
          currency: currency || 'USD',
          startDate: parsedStartDate,
          nextRenewalDate: parsedNextRenewal,
          status: 'active',
          planName: planName,
          sourceEmailId: emailInfo.id,
          sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
        });

      case 'cancellation':
        // Mark subscription as cancelled
        if (existingSubscription) {
          // Only cancel if the cancellation happened AFTER the last known subscription event
          // This prevents old cancellations from overriding a resubscription
          if (existingSubscription.sourceEmailDate && parsedCancellationDate) {
            const lastEventDate = new Date(existingSubscription.sourceEmailDate);
            if (parsedCancellationDate < lastEventDate) {
              // Cancellation is older than the latest event (user resubscribed after cancelling)
              return existingSubscription;
            }
          }
          return await cancelSubscription(existingSubscription._id, {
            cancellationDate: parsedCancellationDate || new Date(),
            accessEndDate: parsedCancellationDate || new Date(),
            sourceEmailId: emailInfo.id,
            sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
          });
        }
        // If no existing subscription, create cancelled one
        return await createSubscription({
          userId,
          companyName: serviceName,
          price: amount || 0,
          currency: currency || 'USD',
          startDate: parsedStartDate,
          cancellationDate: parsedCancellationDate || new Date(),
          accessEndDate: parsedCancellationDate || new Date(),
          status: 'cancelled',
          planName: planName,
          sourceEmailId: emailInfo.id,
          sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
        });

      case 'change':
        // Update subscription with plan change
        if (existingSubscription) {
          return await updateSubscription(existingSubscription._id, {
            price: amount || existingSubscription.price,
            currency: currency || existingSubscription.currency,
            nextRenewalDate: parsedNextRenewal,
            planName: planName || existingSubscription.planName,
            sourceEmailId: emailInfo.id,
            sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
          });
        }
        // If no existing subscription, create one
        return await createSubscription({
          userId,
          companyName: serviceName,
          price: amount || 0,
          currency: currency || 'USD',
          startDate: parsedStartDate,
          nextRenewalDate: parsedNextRenewal,
          status: 'active',
          planName: planName,
          sourceEmailId: emailInfo.id,
          sourceEmailDate: emailInfo.date ? new Date(emailInfo.date) : new Date()
        });

      default:
        throw new Error(`Unknown event type: ${eventType}`);
    }
  } catch (error) {
    console.error('Error processing subscription data:', error);
    throw error;
  }
}

/**
 * Gets all subscriptions for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options (status, etc.)
 * @returns {Promise<Array>} Array of subscriptions
 */
async function getUserSubscriptions(userId, options = {}) {
  try {
    const query = { userId };
    if (options.status) {
      query.status = options.status;
    }

    const subscriptions = await Subscription.find(query)
      .sort({ createdAt: -1 });

    // Auto-roll overdue renewal dates forward for active subscriptions
    // Also backfill nextRenewalDate for subscriptions that never had one (e.g. email-sourced with no explicit billing date)
    const now = new Date();
    for (const sub of subscriptions) {
      if (sub.status !== 'active') continue;

      // If nextRenewalDate is missing, calculate from startDate + frequency
      if (!sub.nextRenewalDate && sub.startDate) {
        const renewal = new Date(sub.startDate);
        let iterations = 0;
        while (renewal < now && iterations < 120) {
          switch (sub.frequency) {
            case 'weekly': renewal.setDate(renewal.getDate() + 7); break;
            case 'yearly': renewal.setFullYear(renewal.getFullYear() + 1); break;
            default: renewal.setMonth(renewal.getMonth() + 1); break;
          }
          iterations++;
        }
        sub.nextRenewalDate = renewal;
        await sub.save();
        continue;
      }

      // Roll overdue dates forward
      if (sub.nextRenewalDate && new Date(sub.nextRenewalDate) < now) {
        const renewal = new Date(sub.nextRenewalDate);
        let iterations = 0;
        while (renewal < now && iterations < 24) {
          switch (sub.frequency) {
            case 'weekly': renewal.setDate(renewal.getDate() + 7); break;
            case 'yearly': renewal.setFullYear(renewal.getFullYear() + 1); break;
            default: renewal.setMonth(renewal.getMonth() + 1); break;
          }
          iterations++;
        }
        sub.nextRenewalDate = renewal;
        await sub.save();
      }
    }

    return subscriptions.map(s => s.toObject());
  } catch (error) {
    console.error('Error getting user subscriptions:', error);
    throw error;
  }
}

module.exports = {
  findExistingSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  processSubscriptionData,
  getUserSubscriptions
};

